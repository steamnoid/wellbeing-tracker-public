import { beforeEach, describe, expect, it } from "vitest";

import { GET, registerDatabaseProbe } from "@/app/api/health/route";

const OUTAGE = "connect ECONNREFUSED 127.0.0.1:5432";

function unauthenticatedRequest(): Request {
  // No cookie, no Authorization header, no session: the endpoint is open.
  return new Request("http://localhost:3000/api/health", { method: "GET" });
}

describe("GET /api/health while the database is unreachable", () => {
  beforeEach(() => {
    registerDatabaseProbe(async () => ({
      reachable: false,
      schemaVersion: null,
      detail: OUTAGE,
    }));
  });

  it("keeps answering 200 with status ok so the instance stays in rotation", async () => {
    const response = await GET(unauthenticatedRequest());

    expect(response.status).toBe(200);
    expect(response.status).not.toBe(503);
    expect((await response.json()).status).toBe("ok");
  });

  it("carries the database state in the body, not in the status code", async () => {
    const response = await GET(unauthenticatedRequest());
    const body = await response.json();

    expect(body).toEqual({
      status: "ok",
      database: { reachable: false, schemaVersion: null, detail: OUTAGE },
    });
    // Distinguishable from the payload a reachable database produces.
    expect(body.database).not.toEqual(
      expect.objectContaining({ reachable: true, schemaVersion: expect.any(String) }),
    );
  });

  it("treats a probe that throws as an unreachable database", async () => {
    registerDatabaseProbe(async () => {
      throw new Error("connection pool exhausted");
    });

    const response = await GET(unauthenticatedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      database: {
        reachable: false,
        schemaVersion: null,
        detail: "database probe failed: connection pool exhausted",
      },
    });
  });
});
