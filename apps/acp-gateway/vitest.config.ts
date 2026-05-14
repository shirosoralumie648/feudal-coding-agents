import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: [path.resolve(__dirname, "src/**/*.test.ts")],
    globals: false,
    environment: "node"
  },
  resolve: {
    alias: {
      "@feudal/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      "@feudal/orchestrator": path.resolve(__dirname, "../../packages/orchestrator/src/task-machine.ts"),
      "@feudal/acp/http-client": path.resolve(__dirname, "../../packages/acp/src/http-client.ts"),
      "@feudal/acp/mock-client": path.resolve(__dirname, "../../packages/acp/src/mock-client.ts"),
      "@feudal/acp": path.resolve(__dirname, "../../packages/acp/src/index.ts")
    }
  }
});
