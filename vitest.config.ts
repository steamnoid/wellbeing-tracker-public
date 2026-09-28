import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Both suites run in Node: the integration tests talk to a running API over
    // HTTP with fetch, and the unit tests are plain TypeScript.
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.ts", "tests/integration/**/*.{test,spec}.ts"],
    // Integration tests boot against a live server, so they need more headroom
    // than the 5s default for both the request and the beforeAll hooks.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
