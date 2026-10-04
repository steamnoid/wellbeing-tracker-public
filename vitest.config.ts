import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.{test,spec}.ts", "tests/integration/**/*.{test,spec}.ts"],
    env: {
      JWT_SECRET: "test-only-jwt-secret",
    },
  },
});
