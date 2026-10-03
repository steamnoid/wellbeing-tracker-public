import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

describe("session secret guard", () => {
  it("does not contain the hard-coded development secret in auth.js or middleware.ts", () => {
    const auth = readRepoFile("web-app/src/lib/auth.js");
    const middleware = readRepoFile("web-app/src/middleware.ts");

    expect(auth).not.toContain("dev-secret-change-me");
    expect(middleware).not.toContain("dev-secret-change-me");
  });

  it("throws when JWT_SECRET is missing in auth.js and middleware.ts", () => {
    const auth = readRepoFile("web-app/src/lib/auth.js");
    const middleware = readRepoFile("web-app/src/middleware.ts");

    expect(auth).toMatch(/if\s*\(!jwtSecret\)/);
    expect(middleware).toMatch(/if\s*\(!jwtSecret\)/);
    expect(auth).toContain("JWT_SECRET is not set");
    expect(middleware).toContain("JWT_SECRET is not set");
  });

  it("has the Dockerfile build-time JWT_SECRET guard", () => {
    const dockerfile = readRepoFile("Dockerfile");

    expect(dockerfile).toContain("ARG JWT_SECRET");
    expect(dockerfile).toMatch(/\$\{JWT_SECRET:\?/);
  });
});
