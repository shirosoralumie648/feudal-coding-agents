import type {
  ACPAgentManifest,
  ACPAwaitExternalInput,
  ACPClient,
  ACPMessage,
  ACPRun,
  ACPRunAgentInput
} from "./index";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`ACP request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export function createHttpACPClient(input: { baseUrl: string }): ACPClient {
  const baseUrl = trimTrailingSlash(input.baseUrl);

  return {
    async listAgents(): Promise<ACPAgentManifest[]> {
      const response = await fetch(`${baseUrl}/agents`, {
        method: "GET"
      });

      return parseJsonOrThrow<ACPAgentManifest[]>(response);
    },

    async runAgent(runInput: ACPRunAgentInput): Promise<ACPRun> {
      const response = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "agent-run",
          ...runInput
        })
      });

      return parseJsonOrThrow<ACPRun>(response);
    },

    async awaitExternalInput(awaitInput: ACPAwaitExternalInput): Promise<ACPRun> {
      const response = await fetch(`${baseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "await",
          ...awaitInput
        })
      });

      return parseJsonOrThrow<ACPRun>(response);
    },

    async respondToAwait(runId: string, responseMessage: ACPMessage): Promise<ACPRun> {
      const response = await fetch(`${baseUrl}/runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(responseMessage)
      });

      return parseJsonOrThrow<ACPRun>(response);
    },

    async getRun(runId: string): Promise<ACPRun> {
      const response = await fetch(`${baseUrl}/runs/${runId}`, {
        method: "GET"
      });

      return parseJsonOrThrow<ACPRun>(response);
    }
  };
}
