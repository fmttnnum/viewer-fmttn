import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWED_BOOKS,
  isBookId,
  sessionCookieName,
  verifySession,
  type BookId,
  type SessionPayload,
} from "@/lib/security";

const FIRST_BOOK: BookId = "altx-1a";
const SHARED_CATALOG_PATHS = new Set([
  "/books/catalog.json",
  "/books/catalog.generated.json",
]);
const FIRST_BOOK_ROOT_FILES = new Set([
  "/links.json",
  "/links.js",
  "/manifest.json",
  "/refFMTTN.pdf",
]);

function accessDenied(request: NextRequest): NextResponse {
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") === true;

  if (!acceptsHtml) {
    return new NextResponse("Accès refusé", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new NextResponse(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Accès réservé</title>
    <style>
      body{font-family:Arial,sans-serif;background:#f6f8fb;color:#162033;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box}
      main{max-width:580px;background:#fff;border:1px solid #dce4ef;border-radius:18px;padding:32px;box-shadow:0 16px 40px rgba(20,42,74,.12);text-align:center}
      h1{font-size:24px;margin:0 0 14px}p{line-height:1.55;margin:0 0 22px}a{display:inline-block;background:#1677ff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700}
    </style>
  </head>
  <body>
    <main>
      <h1>Accès réservé aux professeurs qui utilisent la méthode ALT_X en classe</h1>
      <p>Ouvrez ce manuel depuis la page sécurisée de votre espace professeur sur www.fmttn.com.</p>
      <a href="https://www.fmttn.com/">Retourner sur le site Internet</a>
    </main>
  </body>
</html>`,
    {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function serviceUnavailable(): NextResponse {
  return new NextResponse("Sécurité non configurée", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function sessionForBook(
  request: NextRequest,
  secret: string,
  book: BookId,
): Promise<SessionPayload | null> {
  const token = request.cookies.get(sessionCookieName(book))?.value;
  if (!token) return null;
  return verifySession(token, secret, book);
}

async function anyValidSession(
  request: NextRequest,
  secret: string,
): Promise<SessionPayload | null> {
  for (const book of ALLOWED_BOOKS) {
    const session = await sessionForBook(request, secret, book);
    if (session) return session;
  }
  return null;
}

function protectedBookFromPath(pathname: string): BookId | null {
  if (FIRST_BOOK_ROOT_FILES.has(pathname)) return FIRST_BOOK;
  const match = pathname.match(/^\/books\/([^/]+)(?:\/|$)/);
  if (!match || !isBookId(match[1])) return null;
  return match[1];
}

function allowProtectedResponse(pathname: string): NextResponse {
  const response = NextResponse.next();
  const isBookImage =
    pathname.startsWith("/books/") && /\.(?:png|webp)$/i.test(pathname);
  response.headers.set(
    "Cache-Control",
    isBookImage ? "private, max-age=3600" : "private, no-store",
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.TICKET_SECRET;
  if (!secret) return serviceUnavailable();

  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/reader.html") {
    const requestedBook = searchParams.get("book");
    if (!isBookId(requestedBook)) return accessDenied(request);
    const session = await sessionForBook(request, secret, requestedBook);
    if (!session) return accessDenied(request);
    if (searchParams.get("editLinks") === "1" && !session.admin) {
      return accessDenied(request);
    }
    return allowProtectedResponse(pathname);
  }

  if (pathname.startsWith("/tools/")) {
    const session = await anyValidSession(request, secret);
    if (!session?.admin) return accessDenied(request);
    return allowProtectedResponse(pathname);
  }

  if (SHARED_CATALOG_PATHS.has(pathname)) {
    const session = await anyValidSession(request, secret);
    return session ? allowProtectedResponse(pathname) : accessDenied(request);
  }

  const requestedBook = protectedBookFromPath(pathname);
  if (!requestedBook) return accessDenied(request);
  const session = await sessionForBook(request, secret, requestedBook);
  return session ? allowProtectedResponse(pathname) : accessDenied(request);
}

export const config = {
  matcher: [
    "/reader.html",
    "/books/:path*",
    "/links.json",
    "/links.js",
    "/manifest.json",
    "/refFMTTN.pdf",
    "/tools/:path*",
  ],
};
