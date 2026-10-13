import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// Relative imports keep these modules resolvable by both the Next.js compiler and
// the unit test runner, without depending on path alias configuration.
import { CSRF_HEADER_NAME, verifyRequestCsrf } from "../../../../lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * sign in share one Map through globalThis, so an account created here can
 * immediately sign in through the login route. Move the store and the password
 * handling into the shared provider before this app is deployed anywhere real.
 */
function devUsers(): Map<string, DevUser> {
  const scope = globalThis as GlobalWithDevUsers;
  if (!scope.__havenDevUsers__) {
    scope.__havenDevUsers__ = new Map<string, DevUser>();
  }
  return scope.__havenDevUsers__;
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

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const users = devUsers();

  if (users.has(email)) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const user: DevUser = {
    id: randomUUID(),
    email,
    passwordSalt,
    passwordHash: scryptSync(password, passwordSalt, 64).toString("hex"),
  };

  users.set(email, user);

  const response = NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  response.headers.set("cache-control", "no-store");

  return response;
}
