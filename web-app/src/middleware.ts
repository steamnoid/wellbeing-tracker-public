import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecret } from "./lib/session-secret.js";

const COOKIE_NAME = "wt_session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  let authenticated = false;
  if (token) {
    try {
      await jwtVerify(token, getSessionSecret());
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }
  if (authenticated) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/events/:path*", "/api/events/:path*"],
  runtime: "nodejs",
};
