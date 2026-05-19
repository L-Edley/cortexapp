import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/aion/**/__tests__/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "app/api/obsidian/__tests__/**/*.test.ts",
    ],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
