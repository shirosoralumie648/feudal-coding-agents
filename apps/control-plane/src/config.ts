import { createHttpACPClient } from "@feudal/acp/http-client";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createOrchestratorService } from "./services/orchestrator-service";

export function createACPClientFromEnv() {
  const baseUrl = process.env.ACP_BASE_URL ?? "http://127.0.0.1:4100";
  const mode = process.env.FEUDAL_ACP_MODE ?? "http";

  if (mode === "mock") {
    return createMockACPClient();
  }

  return createHttpACPClient({ baseUrl });
}

export const defaultOrchestratorService = createOrchestratorService({
  acpClient: createACPClientFromEnv()
});
