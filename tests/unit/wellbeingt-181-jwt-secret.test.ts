import { afterEach, describe, expect, it } from "vitest";
import { createSession, verifySession } from "../../web-app/src/lib/auth.js";

const TEST_JWT_SECRET = "test-only-jwt-secret";
const originalJwtSecret = process.env.JWT_SECRET;

function restoreJwtSecret() {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
}

describe("WELLBEINGT-181 JWT_SECRET handling", () => {
  afterEach(restoreJwtSecret);

  it("raises when JWT_SECRET is unset", async () => {
    delete process.env.JWT_SECRET;

    await expect(createSession("user-123", "user@example.com")).rejects.toThrow(
      "JWT_SECRET is required"
    );
    await expect(verifySession("some-token")).rejects.toThrow("JWT_SECRET is required");
  });

  it("raises when JWT_SECRET is empty", async () => {
    process.env.JWT_SECRET = "";

    await expect(createSession("user-123", "user@example.com")).rejects.toThrow(
      "JWT_SECRET is required"
    );
    await expect(verifySession("some-token")).rejects.toThrow("JWT_SECRET is required");
  });

  it("signs and verifies a session when JWT_SECRET is set", async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const token = await createSession("user-123", "user@example.com");
    expect(token).toBeTruthy();

    await expect(verifySession(token)).resolves.toBe("user-123");
  });
});
