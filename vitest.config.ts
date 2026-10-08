import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["mobile/**", "**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
