import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { POST as login } from "../../web-app/app/api/auth/login/route";
import { POST as register } from "../../web-app/app/api/auth/register/route";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_TOKEN_TTL_MS,
  createCsrfToken,
} from "../../web-app/lib/csrf";

const TEST_SECRET = "csrf-test-secret-with-at-least-32-characters";

type CsrfPair = { headerToken?: string | null; cookieToken?: string | null; cookieName?: string };

type Credentials = { email: string; password: string };

let accountCounter = 0;

function nextCredentials(): Credentials {
  accountCounter += 1;
  return {
    email: `login-csrf.${accountCounter}@example.com`,
    password: "correct-horse-battery-staple",
  };
}

function requestWith(path: string, rawBody: string, csrf: CsrfPair = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });

  if (csrf.cookieToken) {
    headers.set("cookie", `${csrf.cookieName ?? CSRF_COOKIE_NAME}=${csrf.cookieToken}`);
  }

  if (csrf.headerToken) {
    headers.set(CSRF_HEADER_NAME, csrf.headerToken);
  }

  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  }) as unknown as NextRequest;
}

function jsonRequest(path: string, body: unknown, csrf: CsrfPair = {}): NextRequest {
  return requestWith(path, JSON.stringify(body), csrf);
}

function csrfPair(token: string, overrides: Partial<CsrfPair> = {}): CsrfPair {
  return { headerToken: token, cookieToken: token, ...overrides };
}

async function registerAccount(credentials: Credentials): Promise<void> {
  const token = createCsrfToken();
  const response = await register(
    jsonRequest("/api/auth/register", credentials, csrfPair(token)),
  );

  expect(
    response.status,
    `registering ${credentials.email} should succeed, so login has a real account`,
  ).toBe(201);
}

beforeEach(() => {
  vi.stubEnv("CSRF_SECRET", TEST_SECRET);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/login CSRF enforcement", () => {
  it("rejects a request that carries neither the cookie nor the header", async () => {
    const credentials = nextCredentials();
    const response = await login(jsonRequest("/api/auth/login", credentials));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid CSRF token",
      reason: "missing",
    });
  });

  it("rejects a request that carries only the cookie", async () => {
    const credentials = nextCredentials();
    const token = createCsrfToken();

    const response = await login(
      jsonRequest("/api/auth/login", credentials, { cookieToken: token }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "missing" });
  });

  it("rejects a request that carries only the header", async () => {
    const credentials = nextCredentials();
    const token = createCsrfToken();

    const response = await login(
      jsonRequest("/api/auth/login", credentials, { headerToken: token }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "missing" });
  });

  it("rejects a cookie and header that do not match", async () => {
    const credentials = nextCredentials();

    const response = await login(
      jsonRequest("/api/auth/login", credentials, {
        cookieToken: createCsrfToken(),
        headerToken: createCsrfToken(),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "mismatch" });
  });

  it("rejects a forged pair even when both halves are identical", async () => {
    const credentials = nextCredentials();
    const [nonce, expiresAt, signature] = createCsrfToken().split(".");
    const forged = `${nonce}.${expiresAt}.${signature.slice(0, -1)}Z`;

    const response = await login(
      jsonRequest("/api/auth/login", credentials, csrfPair(forged)),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "bad-signature" });
  });

  it("rejects an expired pair", async () => {
    const credentials = nextCredentials();
    const expired = createCsrfToken(Date.now() - CSRF_TOKEN_TTL_MS - 1000);

    const response = await login(
      jsonRequest("/api/auth/login", credentials, csrfPair(expired)),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "expired" });
  });

  it("rejects a reused cookie under a different name", async () => {
    const credentials = nextCredentials();
    const token = createCsrfToken();

    const response = await login(
      jsonRequest("/api/auth/login", credentials, csrfPair(token, { cookieName: "other" })),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ reason: "missing" });
  });

  it("signs the user in once the pair is valid", async () => {
    const credentials = nextCredentials();
    await registerAccount(credentials);

    const response = await login(
      jsonRequest("/api/auth/login", credentials, csrfPair(createCsrfToken())),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: expect.any(String), email: credentials.email },
    });
    expect(response.headers.get("set-cookie")).toContain("session=");
  });

  it("still rejects wrong credentials once the pair is valid", async () => {
    const credentials = nextCredentials();
    await registerAccount(credentials);

    const response = await login(
      jsonRequest(
        "/api/auth/login",
        { ...credentials, password: "definitely-the-wrong-password" },
        csrfPair(createCsrfToken()),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid email or password" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an unknown account with the same generic error", async () => {
    const response = await login(
      jsonRequest(
        "/api/auth/login",
        { email: "nobody@example.com", password: "correct-horse-battery-staple" },
        csrfPair(createCsrfToken()),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid email or password" });
  });

  it("rejects a request with a missing email or password", async () => {
    const response = await login(
      jsonRequest("/api/auth/login", { email: "" }, csrfPair(createCsrfToken())),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Email and password are required" });
  });

  it("rejects a body that is not valid JSON", async () => {
    const response = await login(
      requestWith("/api/auth/login", "not json at all", csrfPair(createCsrfToken())),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Request body must be valid JSON" });
  });

  it("checks the CSRF pair before touching the body", async () => {
    // The body is unparseable, but the missing token still decides the response,
    // so an unauthenticated caller cannot probe body handling.
    const response = await login(requestWith("/api/auth/login", "not json at all"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid CSRF token" });
  });
});
