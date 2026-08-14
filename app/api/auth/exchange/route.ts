import { NextRequest, NextResponse } from "next/server";
import {
  isBookId,
  sessionCookieName,
  signJwt,
  verifyTicket,
  type SessionPayload,
} from "@/lib/security";

const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function errorPage(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Accès sécurisé</title>
    <style>
      body{font-family:Arial,sans-serif;background:#f6f8fb;color:#162033;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box}
      main{max-width:560px;background:#fff;border:1px solid #dce4ef;border-radius:18px;padding:32px;box-shadow:0 16px 40px rgba(20,42,74,.12);text-align:center}
      h1{font-size:24px;margin:0 0 14px}p{line-height:1.55;margin:0 0 22px}a{display:inline-block;background:#1677ff;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700}
    </style>
  </head>
  <body>
    <main>
      <h1>Accès sécurisé</h1>
      <p>${message}</p>
      <a href="https://www.fmttn.com/">Retourner sur FMTTN</a>
    </main>
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
  const secret = process.env.TICKET_SECRET;
  if (!secret) {
    return errorPage(
      "La sécurité de la liseuse n’est pas encore configurée.",
      503,
    );
  }

  const ticketToken = request.nextUrl.searchParams.get("ticket") ?? "";
  const requestedBook = request.nextUrl.searchParams.get("book");
  if (!ticketToken || !isBookId(requestedBook)) {
    return errorPage(
      "Ce lien est incomplet. Ouvrez le manuel depuis votre espace professeur.",
      400,
    );
  }

  const ticket = await verifyTicket(ticketToken, secret);
  if (!ticket || ticket.book !== requestedBook) {
    return errorPage(
      "Ce lien est invalide ou a expiré. Retournez dans votre espace professeur et ouvrez à nouveau le manuel.",
      401,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionPayload: SessionPayload = {
    iss: "fmttn-viewer",
    aud: "viewer-fmttn-session",
    sub: ticket.sub,
    book: ticket.book,
    admin: ticket.admin,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
    jti: crypto.randomUUID(),
  };
  const sessionToken = await signJwt(sessionPayload, secret);

  const destination = new URL("/reader.html", request.url);
  destination.searchParams.set("role", "prof");
  destination.searchParams.set("book", ticket.book);
  if (
    ticket.admin &&
    request.nextUrl.searchParams.get("editLinks") === "1"
  ) {
    destination.searchParams.set("editLinks", "1");
  }

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set({
    name: sessionCookieName(ticket.book),
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
