import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = {
  "@platform/core": path.resolve(import.meta.dirname, "packages/core/src/index.ts"),
  "@platform/auth": path.resolve(import.meta.dirname, "packages/auth/src/index.ts"),
  "@platform/security": path.resolve(import.meta.dirname, "packages/security/src/index.ts"),
  "@platform/database": path.resolve(import.meta.dirname, "packages/database/src/index.ts"),
  "@platform/attendance": path.resolve(import.meta.dirname, "modules/attendance/src/index.ts"),
  "@platform/shift": path.resolve(import.meta.dirname, "modules/shift/src/index.ts"),
  "@platform/leave": path.resolve(import.meta.dirname, "modules/leave/src/index.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
