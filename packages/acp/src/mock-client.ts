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
    displayName: "Intake",
    narrativeAlias: "宰相府",
    capabilityGroup: "intake",
    required: true,
    enabledByDefault: true,
    description: "Normalizes user requests into TaskSpec artifacts.",
    capabilities: ["taskspec"]
  },
  {
    name: "analyst-agent",
    role: "中书省",
    displayName: "Analyst",
    narrativeAlias: "中书省",
    capabilityGroup: "planning",
    required: true,
    enabledByDefault: true,
    description: "Produces decision briefs and sub-task plans.",
    capabilities: ["decision-brief"]
  },
  {
    name: "fact-checker-agent",
    role: "采风司",
    displayName: "Fact Checker",
    narrativeAlias: "采风司",
    capabilityGroup: "analysis",
    required: false,
    enabledByDefault: false,
    description: "Checks references and supporting evidence before review.",
    capabilities: ["fact-check"]
  },
  {
    name: "auditor-agent",
    role: "门下省",
    displayName: "Auditor",
    narrativeAlias: "门下省",
    capabilityGroup: "review",
    required: true,
    enabledByDefault: true,
    description: "Checks consistency and risk.",
    capabilities: ["review"]
  },
  {
    name: "critic-agent",
    role: "门下省",
    displayName: "Critic",
    narrativeAlias: "门下省",
    capabilityGroup: "review",
    required: true,
    enabledByDefault: true,
    description: "Produces adversarial review feedback.",
    capabilities: ["review"]
  },
  {
    name: "gongbu-executor",
    role: "工部",
    displayName: "Executor",
    narrativeAlias: "工部",
    capabilityGroup: "execution",
    required: true,
    enabledByDefault: true,
    description: "Executes approved assignments.",
    capabilities: ["assignment", "execution-report"]
  },
  {
    name: "xingbu-verifier",
    role: "刑部",
    displayName: "Verifier",
    narrativeAlias: "刑部",
    capabilityGroup: "verification",
    required: true,
    enabledByDefault: true,
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

function joinedContent(messages: ACPMessage[]): string {
  return messages.map((message) => message.content).join("\n");
}

function reviewVerdictFromMessages(
  messages: ACPMessage[]
): "approve" | "needs_revision" | "reject" {
  const content = joinedContent(messages);

  if (content.includes("#mock:reject")) {
    return "reject";
  }

  if (/#mock:needs_revision(?!-once)\b/.test(content)) {
    return "needs_revision";
  }

  if (
    content.includes("#mock:needs_revision-once") &&
    !content.includes("Revision note:")
  ) {
    return "needs_revision";
  }

  return "approve";
}

function runAgent(agent: string, messages: ACPMessage[]): ACPRun {
  const id = crypto.randomUUID();

  if (agent === "intake-agent") {
    return {
      id,
      agent,
      status: "completed",
      phase: "intake",
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
      phase: "planning",
      messages,
      artifacts: [
        artifact("decision-brief", {
          summary: "Plan the task, review it, then execute it through the queue."
        })
      ]
    };
  }

  if (agent === "auditor-agent" || agent === "critic-agent") {
    const verdict = reviewVerdictFromMessages(messages);
    const note =
      verdict === "approve"
        ? `${agent} found no blocking issues in the task plan.`
        : verdict === "reject"
          ? `${agent} rejected the task plan.`
          : `${agent} requested revision before execution.`;

    return {
      id,
      agent,
      status: "completed",
      phase: "review",
      messages,
      artifacts: [
        artifact("review", {
          verdict,
          reviewer: agent,
          note
        })
      ]
    };
  }

  if (agent === "fact-checker-agent") {
    return {
      id,
      agent,
      status: "completed",
      phase: "planning",
      messages,
      artifacts: [
        artifact("fact-check", {
          summary: "Checked supporting references with no blocking issues.",
          findings: [],
          policyReasons: ["fact-check completed without blocking issues"]
        })
      ]
    };
  }

  if (agent === "gongbu-executor") {
    return {
      id,
      agent,
      status: "completed",
      phase: "execution",
      messages,
      artifacts: [
        artifact("execution-report", {
          result: "completed",
          output: "Executor finished the assignment."
        })
      ]
    };
  }

  if (agent === "xingbu-verifier") {
    return {
      id,
      agent,
      status: "completed",
      phase: "verification",
      messages,
      artifacts: [
        artifact("execution-report", {
          result: "verified",
          output: "Verifier accepted the execution report."
        })
      ]
    };
  }

  throw new Error(`Unknown mock ACP agent: ${agent}`);
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
        phase: "approval",
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
