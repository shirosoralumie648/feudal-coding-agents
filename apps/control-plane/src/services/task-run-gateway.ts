import type {
  ACPAgentManifest,
  ACPAwaitExternalInput,
  ACPClient,
  ACPMessage,
  ACPRun,
  ACPRunAgentInput
} from "@feudal/acp";
import type { GovernanceExecutionMode } from "@feudal/contracts";

export interface TaskRunContext {
  executionMode: GovernanceExecutionMode;
}

export interface TaskRunGatewayResult<T> {
  value: T;
  executionMode: GovernanceExecutionMode;
}

export interface TaskRunGateway {
  listAgents(): Promise<ACPAgentManifest[]>;
  runAgent(
    context: TaskRunContext,
    input: ACPRunAgentInput
  ): Promise<TaskRunGatewayResult<ACPRun>>;
  awaitExternalInput(
    context: TaskRunContext,
    input: ACPAwaitExternalInput
  ): Promise<TaskRunGatewayResult<ACPRun>>;
  respondToAwait(
    context: TaskRunContext,
    runId: string,
    response: ACPMessage
  ): Promise<ACPRun>;
}

function shouldUseMockOnly(mode: GovernanceExecutionMode, realClient?: ACPClient) {
  return mode === "mock_fallback_used";
}

function requireRealClient(realClient?: ACPClient): ACPClient {
  if (!realClient) {
    throw new Error("Real ACP client is not configured");
  }

  return realClient;
}

export function createTaskRunGateway(options: {
  realClient?: ACPClient;
  mockClient: ACPClient;
}): TaskRunGateway {
  async function withFallback<T>(
    context: TaskRunContext,
    work: (client: ACPClient) => Promise<T>
  ): Promise<TaskRunGatewayResult<T>> {
    if (shouldUseMockOnly(context.executionMode, options.realClient)) {
      return {
        value: await work(options.mockClient),
        executionMode: "mock_fallback_used"
      };
    }

    const realClient = requireRealClient(options.realClient);

    try {
      return {
        value: await work(realClient),
        executionMode: context.executionMode
      };
    } catch (error) {
      if (context.executionMode !== "real_with_mock_fallback") {
        throw error;
      }

      return {
        value: await work(options.mockClient),
        executionMode: "mock_fallback_used"
      };
    }
  }

  return {
    async listAgents() {
      if (options.realClient) {
        return options.realClient.listAgents();
      }

      return options.mockClient.listAgents();
    },

    async runAgent(context, input) {
      return withFallback(context, (client) => client.runAgent(input));
    },

    async awaitExternalInput(context, input) {
      return withFallback(context, (client) => client.awaitExternalInput(input));
    },

    async respondToAwait(context, runId, response) {
      const client = shouldUseMockOnly(context.executionMode, options.realClient)
        ? options.mockClient
        : requireRealClient(options.realClient);

      return client.respondToAwait(runId, response);
    }
  };
}
