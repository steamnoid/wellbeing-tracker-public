import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as csrfTokenRoute } from "../../web-app/app/api/auth/csrf/route";
import {
  CSRF_COOKIE_NAME,
  CSRF_TOKEN_TTL_MS,
  createCsrfToken,
  readCookie,
  safeEqual,
  verifyCsrfToken,
  verifyRequestCsrf,
} from "../../web-app/lib/csrf";

const TEST_SECRET = "csrf-test-secret-with-at-least-32-characters";
const OTHER_SECRET = "another-secret-that-is-also-long-enough-32";

beforeEach(() => {
  vi.stubEnv("CSRF_SECRET", TEST_SECRET);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createCsrfToken", () => {
  it("mints a three part token", () => {
    expect(createCsrfToken().split(".")).toHaveLength(3);
  });

  it("mints a different token on every call", () => {
    expect(createCsrfToken()).not.toBe(createCsrfToken());
  });

  it("refuses to mint a token in production without a configured secret", () => {
    vi.stubEnv("CSRF_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createCsrfToken()).toThrowError(/CSRF_SECRET/);
  });
});

describe("verifyCsrfToken", () => {
  it("accepts a freshly minted token", () => {
    expect(verifyCsrfToken(createCsrfToken())).toEqual({ ok: true });
  });

  it("rejects a missing token", () => {
    expect(verifyCsrfToken(null)).toEqual({ ok: false, reason: "missing" });
    expect(verifyCsrfToken(undefined)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects malformed tokens", () => {
    const malformed = ["abc", "a.b", "a.b.c.d", "nonce.not-a-number.signature", ".."];

    for (const token of malformed) {
      expect(verifyCsrfToken(token), token).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("rejects a token whose signature was tampered with", () => {
    const [nonce, expiresAt, signature] = createCsrfToken().split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");

    expect(verifyCsrfToken(`${nonce}.${expiresAt}.${flipped}`)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a token whose expiry was extended", () => {
    const [nonce, , signature] = createCsrfToken().split(".");
    const extended = `${nonce}.${Date.now() + CSRF_TOKEN_TTL_MS * 10}.${signature}`;

    expect(verifyCsrfToken(extended)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const stale = createCsrfToken(now - CSRF_TOKEN_TTL_MS - 1000);

    expect(verifyCsrfToken(stale, now)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCsrfToken();
    vi.stubEnv("CSRF_SECRET", OTHER_SECRET);

    expect(verifyCsrfToken(token)).toEqual({ ok: false, reason: "bad-signature" });
  });
});

describe("safeEqual", () => {
  it("accepts identical strings", () => {
    expect(safeEqual("token.value", "token.value")).toBe(true);
  });

  it("rejects strings that differ in length", () => {
    expect(safeEqual("token", "token.value")).toBe(false);
  });

  it("rejects strings of equal length that differ", () => {
    expect(safeEqual("token.a", "token.b")).toBe(false);
  });
});

describe("readCookie", () => {
  it("finds the csrf cookie among other cookies", () => {
    expect(readCookie("theme=dark; csrf_token=abc.def.ghi; locale=en", CSRF_COOKIE_NAME)).toBe(
      "abc.def.ghi",
    );
  });

  it("returns null when the cookie is absent", () => {
    expect(readCookie("theme=dark", CSRF_COOKIE_NAME)).toBeNull();
    expect(readCookie(undefined, CSRF_COOKIE_NAME)).toBeNull();
    expect(readCookie("", CSRF_COOKIE_NAME)).toBeNull();
  });

  it("decodes percent encoded values", () => {
    expect(readCookie("csrf_token=a%20b", CSRF_COOKIE_NAME)).toBe("a b");
  });
});

describe("verifyRequestCsrf", () => {
  it("accepts a matching cookie and header pair", () => {
    const token = createCsrfToken();

    expect(
      verifyRequestCsrf({
        cookieHeader: `theme=dark; ${CSRF_COOKIE_NAME}=${token}`,
        headerToken: token,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a request with neither half", () => {
    expect(verifyRequestCsrf({})).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a request missing the cookie", () => {
    const token = createCsrfToken();

    expect(verifyRequestCsrf({ headerToken: token })).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a request missing the header", () => {
    const token = createCsrfToken();

    expect(verifyRequestCsrf({ cookieHeader: `${CSRF_COOKIE_NAME}=${token}` })).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("rejects halves that do not match", () => {
    expect(
      verifyRequestCsrf({
        cookieHeader: `${CSRF_COOKIE_NAME}=${createCsrfToken()}`,
        headerToken: createCsrfToken(),
      }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired pair", () => {
    const now = Date.now();
    const stale = createCsrfToken(now - CSRF_TOKEN_TTL_MS - 1000);

    expect(
      verifyRequestCsrf(
        { cookieHeader: `${CSRF_COOKIE_NAME}=${stale}`, headerToken: stale },
        now,
      ),
    ).toEqual({ ok: false, reason: "expired" });
  });
});

describe("GET /api/auth/csrf", () => {
  it("returns a usable token and stores the same value in the csrf cookie", async () => {
    const response = await csrfTokenRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const payload = (await response.json()) as { csrfToken: string };
    expect(verifyCsrfToken(payload.csrfToken)).toEqual({ ok: true });
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.value).toBe(payload.csrfToken);
    expect(response.cookies.get(CSRF_COOKIE_NAME)?.httpOnly).toBe(true);
  });
});
