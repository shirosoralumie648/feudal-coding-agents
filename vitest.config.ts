import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts",
      "packages/orchestrator",
      "packages/acp",
      "apps/control-plane",
      "apps/web"
    ]
  }
});
