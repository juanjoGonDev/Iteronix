import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/**/*.{test,spec}.ts"],
    exclude: ["apps/web-ui/e2e/**", "node_modules/**", "dist/**"],
  },
});
