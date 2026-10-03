import { defineConfig } from "vitest/config";

process.env.JWT_SECRET = "test-only-jwt-secret";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.{test,spec}.ts", "tests/integration/**/*.{test,spec}.ts"],
  },
});
