import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration coverage for the health endpoint when the caller presents no
 * credentials: an unauthenticated request must be rejected rather than served
 * the authenticated payload.
 *
 * The suite talks to a running instance of the API over HTTP, so point it at
 * the right place with:
 *
 *   TEST_API_BASE_URL=http://127.0.0.1:3000 \
 *     npx vitest run tests/integration/api-health-unauthenticated.test.ts
 */
const BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:3000";

describe("GET /api/health (unauthenticated)", () => {
  let response: Response;
  let body: Record<string, unknown>;

  beforeAll(async () => {
    response = await fetch(new URL("/api/health", BASE_URL), {
      headers: { accept: "application/json" },
    });
    body = (await response.json()) as Record<string, unknown>;
  });

  it("is rejected with 401", () => {
    expect(response.status).toBe(401);
  });

  it("reports an unauthorized error rather than health details", () => {
    expect(body).toHaveProperty("error");
    expect(body).not.toHaveProperty("status", "ok");
  });

  it("does not leak internals in the payload", () => {
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("env");
  });
});
