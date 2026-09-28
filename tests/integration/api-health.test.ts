import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration coverage for the health endpoint when the caller presents valid
 * credentials.
 *
 * The suite talks to a running instance of the API over HTTP, so point it at
 * the right place with:
 *
 *   TEST_API_BASE_URL=http://127.0.0.1:3000 TEST_API_KEY=<key> \
 *     npx vitest run tests/integration/api-health.test.ts
 */
const BASE_URL = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:3000";
const API_KEY = process.env.TEST_API_KEY ?? "test-api-key";

describe("GET /api/health (authenticated)", () => {
  let response: Response;
  let body: Record<string, unknown>;

  beforeAll(async () => {
    response = await fetch(new URL("/api/health", BASE_URL), {
      headers: {
        authorization: `Bearer ${API_KEY}`,
        accept: "application/json",
      },
    });
    body = (await response.json()) as Record<string, unknown>;
  });

  it("answers with 200 OK", () => {
    expect(response.status).toBe(200);
  });

  it("returns a JSON body", () => {
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("reports the service as healthy", () => {
    expect(body).toMatchObject({ status: "ok" });
  });

  it("does not leak internals in the payload", () => {
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("env");
  });
});
