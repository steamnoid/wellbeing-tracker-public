import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        // Mirrors the `@/*` path alias from web-app/tsconfig.json so tests can
        // import route handlers (and their dependencies) the way the app does.
        // Anchored on `@/` so scoped packages (`@acme/thing`) are left alone.
        find: /^@\//,
        replacement: fileURLToPath(new URL("./web-app/src", import.meta.url)),
      },
    ],
  },
  test: {
    // Route handlers run on the server, so the Node runtime is what tests need.
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.ts", "tests/integration/**/*.{test,spec}.ts"],
  },
});
