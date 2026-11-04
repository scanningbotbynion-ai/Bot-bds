import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@workspace/db": path.resolve(import.meta.dirname, "../../lib/db/src/index.ts"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["tests/integration/*.test.jsx"],
    setupFiles: ["tests/integration/setup.ts"],
    environmentOptions: { jsdom: { url: "http://preview.test/" } },
    testTimeout: 15_000,
  },
});
