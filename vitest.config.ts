import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["mobile/**", "**/node_modules/**", "**/dist/**"],
    // Checkout hold cleanup updates every stale order. Files share one database, so they have to run one at a time.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
