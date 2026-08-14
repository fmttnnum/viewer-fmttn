export const ALLOWED_BOOKS = ["altx-1a", "altx-1b"] as const;

export type BookId = (typeof ALLOWED_BOOKS)[number];

export type TicketPayload = {
  iss: "fmttn-wix";
  aud: "viewer-fmttn";
  sub: string;
  book: BookId;
  admin: boolean;
  iat: number;
  exp: number;
  jti: string;
};

export type SessionPayload = {
  iss: "fmttn-viewer";
  aud: "viewer-fmttn-session";
  sub: string;
  book: BookId;
  admin: boolean;
  iat: number;
  exp: number;
  jti: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  return JSON.parse(textDecoder.decode(base64UrlToBytes(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBookId(value: unknown): value is BookId {
  return (
    typeof value === "string" &&
    ALLOWED_BOOKS.includes(value as BookId)
  );
}

export function sessionCookieName(book: BookId): string {
  return `altx_session_${book}`;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(
  payload: object,
  secret: string,
): Promise<string> {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(payload);
  const unsignedToken = `${header}.${body}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(unsignedToken),
  );
  return `${unsignedToken}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyAndDecodeJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJson(encodedHeader);
    if (
      !isRecord(header) ||
      header.alg !== "HS256" ||
      header.typ !== "JWT"
    ) {
      return null;
    }

    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      textEncoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!valid) return null;

    const payload = decodeJson(encodedPayload);
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function hasValidCommonClaims(
  payload: Record<string, unknown>,
  expectedIssuer: string,
  expectedAudience: string,
  maximumLifetimeSeconds: number,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  return (
    payload.iss === expectedIssuer &&
    payload.aud === expectedAudience &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    isBookId(payload.book) &&
    typeof payload.jti === "string" &&
    payload.jti.length > 0 &&
    isFiniteNumber(payload.iat) &&
    isFiniteNumber(payload.exp) &&
    payload.iat <= now + 30 &&
    payload.exp > now &&
    payload.exp - payload.iat > 0 &&
    payload.exp - payload.iat <= maximumLifetimeSeconds
  );
}

export async function verifyTicket(
  token: string,
  secret: string,
): Promise<TicketPayload | null> {
  const payload = await verifyAndDecodeJwt(token, secret);
  if (!payload) return null;
  if (!hasValidCommonClaims(payload, "fmttn-wix", "viewer-fmttn", 120)) {
    return null;
  }

  return {
    iss: "fmttn-wix",
    aud: "viewer-fmttn",
    sub: payload.sub as string,
    book: payload.book as BookId,
    admin: payload.admin === true,
    iat: payload.iat as number,
    exp: payload.exp as number,
    jti: payload.jti as string,
  };
}

export async function verifySession(
  token: string,
  secret: string,
  expectedBook: BookId,
): Promise<SessionPayload | null> {
  const payload = await verifyAndDecodeJwt(token, secret);
  if (!payload) return null;
  if (
    !hasValidCommonClaims(
      payload,
      "fmttn-viewer",
      "viewer-fmttn-session",
      8 * 60 * 60 + 60,
    ) ||
    payload.book !== expectedBook
  ) {
    return null;
  }

  return {
    iss: "fmttn-viewer",
    aud: "viewer-fmttn-session",
    sub: payload.sub as string,
    book: payload.book as BookId,
    admin: payload.admin === true,
    iat: payload.iat as number,
    exp: payload.exp as number,
    jti: payload.jti as string,
  };
}
