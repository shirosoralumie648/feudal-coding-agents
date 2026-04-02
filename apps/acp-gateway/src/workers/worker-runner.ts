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
      const rawPayload = await options.codexRunner.run({
        role: input.agent,
        prompt: definition.buildPrompt(input.messages),
        schema: definition.outputSchema
      });
      let payload: Record<string, unknown>;

      try {
        payload = definition.parseOutput(rawPayload);
      } catch {
        throw new Error(`Invalid ${input.agent} output`);
      }

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
