import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSessionSecret,
  SESSION_SECRET_FILE,
} from "../../web-app/src/lib/session-secret.js";

describe("session-secret fallback", () => {
  let originalEnv: string | undefined;
  let originalFileExisted: boolean;
  let originalFileContents: string | null;

  beforeEach(() => {
    originalEnv = process.env.JWT_SECRET;
    originalFileExisted = existsSync(SESSION_SECRET_FILE);
    originalFileContents = originalFileExisted
      ? readFileSync(SESSION_SECRET_FILE, "utf8")
      : null;

    delete process.env.JWT_SECRET;
    rmSync(SESSION_SECRET_FILE, { force: true });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalEnv;
    }

    if (originalFileExisted && originalFileContents !== null) {
      mkdirSync(dirname(SESSION_SECRET_FILE), { recursive: true });
      writeFileSync(SESSION_SECRET_FILE, originalFileContents);
    } else {
      rmSync(SESSION_SECRET_FILE, { force: true });
    }
  });

  it("creates and reuses a persistent random secret file under web-app when JWT_SECRET is not set", () => {
    const first = getSessionSecret();
    const second = getSessionSecret();

    expect(first).toBeInstanceOf(Uint8Array);
    expect(first.length).toBe(64);
    expect(second).toEqual(first);

    expect(existsSync(SESSION_SECRET_FILE)).toBe(true);
    const saved = readFileSync(SESSION_SECRET_FILE, "utf8").trim();
    expect(saved).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextEncoder().encode(saved)).toEqual(first);
  });

  it("uses JWT_SECRET when it is set instead of creating a file", () => {
    process.env.JWT_SECRET = "test-secret";

    const secret = getSessionSecret();

    expect(secret).toEqual(new TextEncoder().encode("test-secret"));
    expect(existsSync(SESSION_SECRET_FILE)).toBe(false);
  });

  it("keeps an existing secret file rather than replacing it", () => {
    mkdirSync(dirname(SESSION_SECRET_FILE), { recursive: true });
    writeFileSync(SESSION_SECRET_FILE, "existing-secret\n");

    const secret = getSessionSecret();

    expect(secret).toEqual(new TextEncoder().encode("existing-secret"));
    expect(readFileSync(SESSION_SECRET_FILE, "utf8")).toBe("existing-secret\n");
  });
});
