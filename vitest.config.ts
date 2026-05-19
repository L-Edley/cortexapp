import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "lib/aion/**/__tests__/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "app/api/obsidian/__tests__/**/*.test.ts",
      "app/api/aion/__tests__/**/*.test.ts",
      "components/__tests__/**/*.test.ts",
    ],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
