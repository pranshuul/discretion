import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "{packages,services,apps}/*/test/**/*.test.ts",
      "installer/test/**/*.test.ts",
    ],
  },
});
