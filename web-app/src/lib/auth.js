import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";

export const COOKIE_NAME = "wt_session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_DAYS = 7;

function secret() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(jwtSecret);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function registerUser(email, password, db = getDb()) {
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    throw httpError(400, "A valid email address is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const user = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString(),
  };
  try {
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      user.id,
      user.email,
      user.password_hash,
      user.created_at
    );
  } catch (err) {
    if (String(err?.message).includes("UNIQUE constraint failed")) {
      throw httpError(409, "Email already used");
    }
    throw err;
  }
  return { id: user.id, email: user.email, created_at: user.created_at };
}

export function authenticateUser(email, password, db = getDb()) {
  const row =
    typeof email === "string"
      ? db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email.trim().toLowerCase())
      : undefined;
  if (!row || typeof password !== "string" || !bcrypt.compareSync(password, row.password_hash)) {
    throw httpError(401, "Invalid email or password");
  }
  return { id: row.id, email: row.email };
}

export async function createSession(userId, email = "") {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token) {
  const payload = await verifySessionPayload(token);
  return payload ? payload.sub ?? null : null;
}

export async function verifySessionPayload(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

function cookieFlags(maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildSetCookie(token) {
  return `${COOKIE_NAME}=${token}; ${cookieFlags(60 * 60 * 24 * SESSION_DAYS)}`;
}

export function buildClearCookie() {
  return `${COOKIE_NAME}=; ${cookieFlags(0)}`;
}
