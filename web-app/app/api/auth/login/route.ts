import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// Relative imports keep these modules resolvable by both the Next.js compiler and
// the unit test runner, without depending on path alias configuration.
import { CSRF_HEADER_NAME, verifyRequestCsrf } from "../../../../lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type DevUser = {
  id: string;
  email: string;
  passwordSalt: string;
  /** scrypt(password, passwordSalt, 64) encoded as hex. */
  passwordHash: string;
};

type GlobalWithDevUsers = typeof globalThis & { __havenDevUsers__?: Map<string, DevUser> };

/**
 * Development-only stand-in for the identity provider module. Registration and
 * sign in share one Map through globalThis, so an account created by the register
 * route can immediately sign in here. Move the store and the password handling
 * into the shared provider before this app is deployed anywhere real.
 */
function devUsers(): Map<string, DevUser> {
  const scope = globalThis as GlobalWithDevUsers;
  if (!scope.__havenDevUsers__) {
    scope.__havenDevUsers__ = new Map<string, DevUser>();
  }
  return scope.__havenDevUsers__;
}

function unauthorized(): NextResponse {
  // A single message for both unknown accounts and wrong passwords, so the
  // endpoint does not reveal which email addresses are registered.
  return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = verifyRequestCsrf({
    cookieHeader: request.headers.get("cookie"),
    headerToken: request.headers.get(CSRF_HEADER_NAME),
  });

  if (!csrf.ok) {
    return NextResponse.json(
      { error: "Invalid CSRF token", reason: csrf.reason },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const body = (payload ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = devUsers().get(email);

  if (!user) {
    // Burn a comparable amount of time so an unknown email is not obviously
    // faster to answer than a wrong password.
    scryptSync(password, "timing-equaliser", 64);
    return unauthorized();
  }

  const candidate = scryptSync(password, user.passwordSalt, 64);
  const expected = Buffer.from(user.passwordHash, "hex");
  const passwordMatches =
    candidate.length === expected.length && timingSafeEqual(candidate, expected);

  if (!passwordMatches) {
    return unauthorized();
  }

  const response = NextResponse.json({ user: { id: user.id, email: user.email } });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: randomBytes(32).toString("base64url"),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  response.headers.set("cache-control", "no-store");

  return response;
}
