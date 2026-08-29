import { NextRequest, NextResponse } from "next/server";
import {
  isBookId,
  sessionCookieName,
  signJwt,
  type SessionPayload,
} from "@/lib/security";

const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const TEST_BRANCH = "test-tablettes";

export const dynamic = "force-dynamic";

function messagePage(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Accès de test</title>
  </head>
  <body style="font-family:Arial,sans-serif;padding:32px">
    <h1>Accès de test</h1>
    <p>${message}</p>
  </body>
</html>`,
    {
      status,
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const isAuthorizedPreview =
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === TEST_BRANCH;

  if (!isAuthorizedPreview) {
    return messagePage("Cette entrée n’existe pas dans cet environnement.", 404);
  }

  const expectedCode = process.env.PREVIEW_ACCESS_CODE;
  const providedCode = request.nextUrl.searchParams.get("code") ?? "";
  if (!expectedCode || providedCode !== expectedCode) {
    return messagePage("Le code de test est incorrect.", 401);
  }

  const requestedBook = request.nextUrl.searchParams.get("book");
  if (!isBookId(requestedBook)) {
    return messagePage("Le manuel demandé n’est pas reconnu.", 400);
  }

  const ticketSecret = process.env.TICKET_SECRET;
  if (!ticketSecret) {
    return messagePage("La sécurité de la liseuse n’est pas configurée.", 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionPayload: SessionPayload = {
    iss: "fmttn-viewer",
    aud: "viewer-fmttn-session",
    sub: "preview-tablet-test",
    book: requestedBook,
    admin: false,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
    jti: crypto.randomUUID(),
  };
  const sessionToken = await signJwt(sessionPayload, ticketSecret);

  const destination = new URL("/reader.html", request.url);
  destination.searchParams.set("role", "prof");
  destination.searchParams.set("book", requestedBook);

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set({
    name: sessionCookieName(requestedBook),
    value: sessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
