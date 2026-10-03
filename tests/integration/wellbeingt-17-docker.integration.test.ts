/**
 * QA: WELLBEINGT-17 — Dockerization integration tests
 *
 * Builds the Docker image, starts the container, and verifies runtime
 * behavior against approved Product AC. Covers AC1 (build succeeds),
 * AC2 (better-sqlite3 compiles), AC3 (HTTP responds), AC4 (healthcheck
 * reports healthy), AC6 (image size + build tools stripped).
 *
 * HTTP checks run via `docker exec` (in-container) since host port
 * forwarding is unreliable across environments; the container's own
 * network serves the app and this matches what the app's runtime port
 * exposes.
 *
 * Requires: Docker daemon running.
 * Traceability: proposal:ecadf4a9, proposal:22fbaef9, proposal:efd1f747,
 *   proposal:47e008d2, proposal:746d7643, proposal:c27f92d2
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, exec } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const IMAGE_TAG = "qa-wellbeingt-17-test";
const CONTAINER_NAME = `qa-wt17-${Date.now()}`;
const TEST_JWT_SECRET = process.env.JWT_SECRET ?? "test-only-jwt-secret";

function run(cmd: string, opts: { timeout?: number; cwd?: string } = {}): string {
  return execSync(cmd, {
    cwd: opts.cwd ?? ROOT,
    timeout: opts.timeout ?? 120_000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "pipe", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

const hasDocker = dockerAvailable();

describe.skipIf(!hasDocker)("QA: WELLBEINGT-17 Dockerization — integration", () => {
  let imageBuilt = false;
  let containerStarted = false;

  beforeAll(() => {
    if (!hasDocker) return;
    try {
      // Build the image
      run(`docker build --build-arg JWT_SECRET=${TEST_JWT_SECRET} -t ${IMAGE_TAG} .`, { timeout: 300_000 });
      imageBuilt = true;
      // Start the container (port mapping may not forward on all hosts;
      // runtime checks go through `docker exec`)
      run(`docker run -d --name ${CONTAINER_NAME} -p 3000:3000 ${IMAGE_TAG}`);
      containerStarted = true;
    } catch {
      imageBuilt = imageBuilt; // keep actual build result
      containerStarted = false;
    }
  });

  afterAll(() => {
    if (!hasDocker) return;
    try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "pipe" }); } catch { /* ignore */ }
    try { execSync(`docker rmi ${IMAGE_TAG}`, { stdio: "pipe" }); } catch { /* ignore */ }
  });

  // ── AC1 — Build succeeds ─────────────────────────────────────────
  it("AC1: docker build completes without errors", () => {
    expect(imageBuilt).toBe(true);
  });

  // ── AC2 — better-sqlite3 native module ────────────────────────────
  it("AC2: better-sqlite3 is installed without native compilation errors", () => {
    if (!imageBuilt) return expect.skip();
    const out = run(`docker run --rm ${IMAGE_TAG} npm ls better-sqlite3`);
    expect(out).toMatch(/better-sqlite3@/);
    expect(out).not.toMatch(/ERR!/i);
    expect(out).not.toMatch(/^error/i);
  });

  it("AC2: better-sqlite3 compiled .node binary exists in image", () => {
    if (!imageBuilt) return expect.skip();
    const out = run(
      `docker run --rm ${IMAGE_TAG} find /app/node_modules/better-sqlite3 -name "*.node" -type f`
    );
    expect(out.length).toBeGreaterThan(0);
  });

  // ── AC3 — App HTTP endpoint responds from inside the container ──
  it("AC3: container starts (app process running)", () => {
    if (!imageBuilt) return expect.skip();
    expect(containerStarted).toBe(true);
  });

  it("AC3: app responds with 200 or 3xx from inside container", () => {
    if (!containerStarted) return expect.skip();
    // Wait for app to become ready (up to 30s)
    let status = "";
    for (let i = 0; i < 30; i++) {
      try {
        status = run(`docker exec ${CONTAINER_NAME} curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`, { timeout: 10_000 });
        if (/^[23]\d\d$/.test(status)) break;
      } catch {
        // not ready yet
      }
      execSync(`sleep 1`);
    }
    expect(status).toMatch(/^[23]\d\d$/);
  });

  it("AC3: response body is non-empty", () => {
    if (!containerStarted) return expect.skip();
    // app is already up (previous test ensured it); body length > 0
    let body = "";
    for (let i = 0; i < 30; i++) {
      try {
        body = run(`docker exec ${CONTAINER_NAME} curl -s http://localhost:3000/`, { timeout: 10_000 });
        if (body.length > 0) break;
      } catch {
        // retry
      }
      execSync(`sleep 1`);
    }
    expect(body.length).toBeGreaterThan(0);
  });

  // ── AC4 — HEALTHCHECK reports healthy ─────────────────────────────
  it(
    "AC4: Docker HEALTHCHECK reports healthy after app is ready",
    () => {
      if (!containerStarted) return expect.skip();
      // HEALTHCHECK interval=30s, timeout=3s, retries=3 → allow up to ~120s
      const deadline = Date.now() + 120_000;
      let health = "";
      while (Date.now() < deadline) {
        try {
          health = run(`docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`, { timeout: 10_000 });
          if (health === "healthy") break;
        } catch {
          // no health data yet
        }
        execSync(`sleep 5`);
      }
      expect(health).toBe("healthy");
    },
    135_000
  );

  // ── AC6 — Image size + build tools stripped ───────────────────────
  it("AC6: multi-stage image is smaller than 800MB (slim runtime)", () => {
    if (!imageBuilt) return expect.skip();
    const out = run(`docker image inspect ${IMAGE_TAG} --format='{{.Size}}'`);
    const sizeBytes = parseInt(out, 10);
    expect(sizeBytes).toBeLessThan(800 * 1024 * 1024);
  });

  it("AC6: runtime image does NOT contain build-essential package", () => {
    if (!imageBuilt) return expect.skip();
    const out = run(`docker run --rm ${IMAGE_TAG} dpkg -s build-essential 2>&1 || true`);
    // dpkg -s on a missing package reports "is not installed and no
    // information is available" — confirming build-essential is NOT present
    // in the slim runtime image.
    expect(out).toMatch(/not installed and no information is available/);
  });
});
