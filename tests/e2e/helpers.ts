import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Mirrors the cookie and header names used by web-app/lib/csrf.ts. */
export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

export type Credentials = { email: string; password: string };

export type ApiResult = { status: number; body: Record<string, unknown> };

let accountCounter = 0;

export function uniqueEmail(prefix = "shopper"): string {
  accountCounter += 1;
  return `${prefix}.${Date.now()}.${accountCounter}@example.com`;
}

export function credentialsFor(overrides: Partial<Credentials> = {}): Credentials {
  return {
    email: overrides.email ?? uniqueEmail(),
    password: overrides.password ?? "correct-horse-battery-staple",
  };
}

/**
 * Fetches a CSRF token. The matching `csrf_token` cookie is kept in the request
 * context jar, so later requests from the same context can send both halves.
 */
export async function fetchCsrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/auth/csrf", { failOnStatusCode: false });
  expect(response.status(), "GET /api/auth/csrf should return 200").toBe(200);

  const payload = (await response.json()) as { csrfToken?: string };
  expect(payload.csrfToken, "GET /api/auth/csrf should return a token").toBeTruthy();

  return payload.csrfToken as string;
}

export async function readCsrfCookie(request: APIRequestContext): Promise<string | undefined> {
  const state = await request.storageState();
  return state.cookies.find((cookie) => cookie.name === CSRF_COOKIE_NAME)?.value;
}

export async function postJson(
  request: APIRequestContext,
  path: string,
  body: unknown,
  options: { csrfToken?: string | null } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.csrfToken) {
    headers[CSRF_HEADER_NAME] = options.csrfToken;
  }

  const response = await request.post(path, { headers, data: body, failOnStatusCode: false });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  return { status: response.status(), body: parsed };
}

/** Creates an account and returns the credentials that are now able to sign in. */
export async function registerUser(
  request: APIRequestContext,
  credentials: Credentials = credentialsFor(),
): Promise<Credentials> {
  const csrfToken = await fetchCsrfToken(request);
  const { status, body } = await postJson(request, "/api/auth/register", credentials, { csrfToken });

  expect(
    status,
    `registering ${credentials.email} should return 201 (body: ${JSON.stringify(body)})`,
  ).toBe(201);

  return credentials;
}

export async function signInWithApi(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<ApiResult> {
  const csrfToken = await fetchCsrfToken(request);
  return postJson(request, "/api/auth/login", credentials, { csrfToken });
}

export async function loginUser(
  request: APIRequestContext,
  credentials: Credentials,
): Promise<void> {
  const result = await signInWithApi(request, credentials);
  expect(
    result.status,
    `signing in ${credentials.email} should return 200 (body: ${JSON.stringify(result.body)})`,
  ).toBe(200);
}

export async function registerAndLogin(
  request: APIRequestContext,
  credentials: Credentials = credentialsFor(),
): Promise<Credentials> {
  await registerUser(request, credentials);
  await loginUser(request, credentials);
  return credentials;
}

export async function openLoginPage(page: Page): Promise<void> {
  await page.goto("/login");
  // The submit button stays disabled until the page has fetched a CSRF token.
  await expect(page.getByTestId("login-submit")).toBeEnabled();
}

export async function fillLoginForm(page: Page, credentials: Credentials): Promise<void> {
  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
}

/** Submits the login form and returns the status of the resulting API response. */
export async function submitLoginForm(page: Page, credentials: Credentials): Promise<number> {
  await fillLoginForm(page, credentials);

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/auth/login") && candidate.request().method() === "POST",
    ),
    page.getByTestId("login-submit").click(),
  ]);

  return response.status();
}

export async function signInThroughUi(page: Page, credentials: Credentials): Promise<void> {
  await openLoginPage(page);
  const status = await submitLoginForm(page, credentials);
  expect(status, "signing in through the form should succeed").toBe(200);
  await expect(page.getByTestId("login-status")).toHaveText(/signed in/i);
}

export async function openRegisterPage(page: Page): Promise<void> {
  await page.goto("/register");
  await expect(page.getByTestId("register-submit")).toBeEnabled();
}

export async function fillRegisterForm(page: Page, credentials: Credentials): Promise<void> {
  await page.getByTestId("register-email").fill(credentials.email);
  await page.getByTestId("register-password").fill(credentials.password);
}

/** Submits the registration form and returns the status of the API response. */
export async function submitRegisterForm(page: Page, credentials: Credentials): Promise<number> {
  await fillRegisterForm(page, credentials);

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/auth/register") && candidate.request().method() === "POST",
    ),
    page.getByTestId("register-submit").click(),
  ]);

  return response.status();
}

export async function signUpThroughUi(page: Page, credentials: Credentials): Promise<void> {
  await openRegisterPage(page);
  const status = await submitRegisterForm(page, credentials);
  expect(status, "creating an account through the form should succeed").toBe(201);
  await expect(page.getByTestId("register-status")).toHaveText(/account created/i);
}
