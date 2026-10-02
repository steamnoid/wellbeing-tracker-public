import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { getSessionSecret, SESSION_SECRET_FILE } from "../../web-app/src/lib/session-secret.js";

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe("session-secret", () => {
  it("uses JWT_SECRET when it is set", () => {
    process.env.JWT_SECRET = "configured-secret";
    expect(new TextDecoder().decode(getSessionSecret())).toBe("configured-secret");
  });

  it("persists a random secret and reuses it when JWT_SECRET is not set", () => {
    delete process.env.JWT_SECRET;

    const first = new TextDecoder().decode(getSessionSecret());
    expect(first).toMatch(/^[0-9a-f]{64}$/);

    const second = new TextDecoder().decode(getSessionSecret());
    expect(second).toBe(first);

    expect(existsSync(SESSION_SECRET_FILE)).toBe(true);
    expect(readFileSync(SESSION_SECRET_FILE, "utf8")).toBe(`${first}\n`);
  });
});
