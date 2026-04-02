import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/contracts",
  "packages/orchestrator",
  "packages/acp",
  "apps/control-plane",
  "apps/web"
]);
