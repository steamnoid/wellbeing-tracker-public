import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Double submit CSRF protection.
 *
 * A token is minted as `<nonce>.<expiresAt>.<signature>`, where the signature is
 * an HMAC of `<nonce>.<expiresAt>` computed with CSRF_SECRET. The token is
 * handed to the browser twice: once in the httpOnly `csrf_token` cookie and once
 * in the JSON body of the token endpoint. Clients echo the JSON copy back in the
 * `x-csrf-token` header. A state changing request is accepted only when both
 * copies are present, byte identical, and carry a valid, unexpired signature.
 */

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_TOKEN_TTL_SECONDS = 60 * 60 * 2;
export const CSRF_TOKEN_TTL_MS = CSRF_TOKEN_TTL_SECONDS * 1000;

const DEV_SECRET = "dev-csrf-secret-do-not-use-in-production";
const MIN_SECRET_LENGTH = 32;

let warnedAboutDevSecret = false;

function resolveSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) {
    return secret;
  }

  // Fail closed outside local development: a predictable secret would let anyone
  // mint their own tokens.
  if (process.env.NODE_ENV === "production" && process.env.CSRF_ALLOW_DEV_SECRET !== "1") {
    throw new Error(
      `CSRF_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }

  if (!warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    console.warn("[csrf] CSRF_SECRET is not configured; falling back to the development secret.");
  }

  return DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", resolveSecret()).update(payload).digest("base64url");
}

/** Constant time string comparison that never leaks length mismatches. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createCsrfToken(now: number = Date.now()): string {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = now + CSRF_TOKEN_TTL_MS;
  const payload = `${nonce}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export type CsrfFailureReason =
  | "missing"
  | "malformed"
  | "expired"
  | "bad-signature"
  | "mismatch";

export type CsrfVerification = { ok: true } | { ok: false; reason: CsrfFailureReason };

const ACCEPTED: CsrfVerification = { ok: true };

function reject(reason: CsrfFailureReason): CsrfVerification {
  return { ok: false, reason };
}

export function verifyCsrfToken(
  token: string | null | undefined,
  now: number = Date.now(),
): CsrfVerification {
  if (!token) {
    return reject("missing");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return reject("malformed");
  }

  const [nonce, expiresAtRaw, signature] = parts;
  if (!nonce || !expiresAtRaw || !signature) {
    return reject("malformed");
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) {
    return reject("malformed");
  }

  if (!safeEqual(signature, sign(`${nonce}.${expiresAtRaw}`))) {
    return reject("bad-signature");
  }

  if (expiresAt <= now) {
    return reject("expired");
  }

  return ACCEPTED;
}

/** Reads a single cookie value out of a raw `cookie` request header. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator === -1) {
      continue;
    }

    if (entry.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = entry.slice(separator + 1).trim();
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

/**
 * Verifies the double submit pair carried by a request. Accepts a plain shape so
 * route handlers and unit tests can both use it without a Request instance.
 */
export function verifyRequestCsrf(
  request: { cookieHeader?: string | null; headerToken?: string | null },
  now: number = Date.now(),
): CsrfVerification {
  const cookieToken = readCookie(request.cookieHeader, CSRF_COOKIE_NAME);
  const headerToken = request.headerToken ?? null;

  if (!cookieToken || !headerToken) {
    return reject("missing");
  }

  if (!safeEqual(cookieToken, headerToken)) {
    return reject("mismatch");
  }

  return verifyCsrfToken(headerToken, now);
}
