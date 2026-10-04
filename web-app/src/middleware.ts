import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "wt_session";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(value);
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  let authenticated = false;
  if (token) {
    const key = secret();
    try {
      await jwtVerify(token, key);
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
};
