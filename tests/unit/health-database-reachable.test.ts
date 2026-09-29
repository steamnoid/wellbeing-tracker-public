import { beforeEach, describe, expect, it } from "vitest";

import { GET, registerDatabaseProbe } from "@/app/api/health/route";

const SCHEMA_VERSION = "0007_orders_and_invoices";
const DETAIL = "connected to db.internal:5432";

function unauthenticatedRequest(): Request {
  // No cookie, no Authorization header, no session: the endpoint is open.
  return new Request("http://localhost:3000/api/health", { method: "GET" });
}

describe("GET /api/health with a reachable database", () => {
  beforeEach(() => {
    registerDatabaseProbe(async () => ({
      reachable: true,
      schemaVersion: SCHEMA_VERSION,
      detail: DETAIL,
    }));
  });

  it("answers an unauthenticated request with 200 and a JSON body", async () => {
    const response = await GET(unauthenticatedRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("reports the database as reachable and carries the schema version it reports", async () => {
    const response = await GET(unauthenticatedRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      database: {
        reachable: true,
        schemaVersion: SCHEMA_VERSION,
        detail: DETAIL,
      },
    });
  });
});
