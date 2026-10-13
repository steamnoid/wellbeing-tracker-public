import { NextResponse } from "next/server";

import {
  CSRF_COOKIE_NAME,
  CSRF_TOKEN_TTL_SECONDS,
  createCsrfToken,
} from "../../../../lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a fresh CSRF token. The token is returned in the JSON body so the client
 * can send it in the `x-csrf-token` header, and is also stored in the httpOnly
 * `csrf_token` cookie so the server can compare the two on later requests.
 */
export async function GET(): Promise<NextResponse> {
  const csrfToken = createCsrfToken();

  const response = NextResponse.json({
    csrfToken,
    expiresIn: CSRF_TOKEN_TTL_SECONDS,
  });

  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: csrfToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CSRF_TOKEN_TTL_SECONDS,
  });

  response.headers.set("cache-control", "no-store");

  return response;
}
