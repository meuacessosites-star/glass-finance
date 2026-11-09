import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/convex-backend.test.mjs"],
    environment: "edge-runtime",
    testTimeout: 15000,
    pool: "forks",
    fileParallelism: false,
  },
});
