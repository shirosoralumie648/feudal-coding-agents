import { randomUUID } from "node:crypto";
import type { ACPMessage } from "@feudal/acp";
import type { GatewayRunRecord } from "../store";
import { workerRegistry } from "./registry";
import type { CodexRunner, GatewayWorkerName } from "./types";

export function createWorkerRunner(options: { codexRunner: CodexRunner }) {
  return {
    async runAgent(input: {
      agent: GatewayWorkerName;
      messages: ACPMessage[];
    }): Promise<GatewayRunRecord> {
      const definition = workerRegistry[input.agent];
      const payload = await options.codexRunner.run({
        role: input.agent,
        prompt: definition.buildPrompt(input.messages),
        schema: definition.outputSchema
      });

      return {
        id: randomUUID(),
        agent: input.agent,
        status: "completed",
        messages: input.messages,
        artifacts: [
          {
            id: randomUUID(),
            name: definition.artifactName,
            mimeType: "application/json",
            content: payload
          }
        ]
      };
    }
  };
}
