import type {
  ACPAgentManifest,
  ACPArtifact,
  ACPClient,
  ACPMessage,
  ACPRun
} from "./index";

const manifests: ACPAgentManifest[] = [
  {
    name: "intake-agent",
    role: "宰相府",
    description: "Normalizes user requests into TaskSpec artifacts.",
    capabilities: ["taskspec"]
  },
  {
    name: "analyst-agent",
    role: "中书省",
    description: "Produces decision briefs and sub-task plans.",
    capabilities: ["decision-brief"]
  },
  {
    name: "auditor-agent",
    role: "门下省",
    description: "Checks consistency and risk.",
    capabilities: ["review"]
  },
  {
    name: "critic-agent",
    role: "门下省",
    description: "Produces adversarial review feedback.",
    capabilities: ["review"]
  },
  {
    name: "gongbu-executor",
    role: "工部",
    description: "Executes approved assignments.",
    capabilities: ["assignment", "execution-report"]
  },
  {
    name: "xingbu-verifier",
    role: "刑部",
    description: "Verifies execution evidence.",
    capabilities: ["execution-report"]
  }
];

function artifact(kind: string, content: unknown): ACPArtifact {
  return {
    id: crypto.randomUUID(),
    name: `${kind}.json`,
    mimeType: "application/json",
    content
  };
}

function runAgent(agent: string, messages: ACPMessage[]): ACPRun {
  const id = crypto.randomUUID();

  if (agent === "intake-agent") {
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("taskspec", {
          title: messages.at(-1)?.content ?? "Untitled task"
        })
      ]
    };
  }

  if (agent === "analyst-agent") {
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("decision-brief", {
          summary: "Plan the task, review it, then execute it through the queue."
        })
      ]
    };
  }

  if (agent === "auditor-agent" || agent === "critic-agent") {
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("review", {
          verdict: "approve",
          reviewer: agent,
          note: `${agent} found no blocking issues in the Phase 1 skeleton.`
        })
      ]
    };
  }

  if (agent === "gongbu-executor") {
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("execution-report", {
          result: "completed",
          output: "Executor finished the assignment."
        })
      ]
    };
  }

  return {
    id,
    agent,
    status: "completed",
    messages,
    artifacts: [
      artifact("execution-report", {
        result: "verified",
        output: "Verifier accepted the execution report."
      })
    ]
  };
}

export function createMockACPClient(): ACPClient {
  const runs = new Map<string, ACPRun>();

  return {
    async listAgents() {
      return manifests;
    },

    async runAgent(input) {
      const run = runAgent(input.agent, input.messages);
      runs.set(run.id, run);
      return run;
    },

    async awaitExternalInput(input) {
      const run: ACPRun = {
        id: crypto.randomUUID(),
        agent: input.label,
        status: "awaiting",
        messages: [],
        artifacts: [],
        awaitPrompt: input.prompt,
        allowedActions: input.actions
      };

      runs.set(run.id, run);
      return run;
    },

    async respondToAwait(runId, response) {
      const existing = runs.get(runId);

      if (!existing || existing.status !== "awaiting") {
        throw new Error(`Run ${runId} is not awaiting input`);
      }

      const completed: ACPRun = {
        ...existing,
        status: "completed",
        messages: [...existing.messages, response]
      };

      runs.set(runId, completed);
      return completed;
    },

    async getRun(runId) {
      return runs.get(runId);
    }
  };
}
