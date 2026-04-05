# Governance Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governance fields, review verdicts, revision loops, and task-level mock fallback drive the real control-plane workflow and the web console.

**Architecture:** Extend the shared task contract with explicit governance state, then route the control-plane workflow through a small governance policy layer and a task-scoped ACP run gateway. Keep persistence projection-based, add a revision API and action validation, and let the web console render governance state from explicit task data instead of inferred status text.

**Tech Stack:** TypeScript, Zod, Fastify, React 19, Vitest, Playwright, ACP mock/http clients

---

## File Map

### Shared Contracts And State Machine
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `packages/orchestrator/src/task-machine.ts`
- Modify: `packages/orchestrator/src/task-machine.test.ts`

### Governance Helpers And ACP Fallback
- Modify: `packages/acp/src/mock-client.ts`
- Modify: `packages/acp/src/mock-client.test.ts`
- Create: `apps/control-plane/src/governance/policy.ts`
- Create: `apps/control-plane/src/governance/policy.test.ts`
- Create: `apps/control-plane/src/services/task-run-gateway.ts`
- Create: `apps/control-plane/src/services/task-run-gateway.test.ts`

### Control-Plane Workflow And Persistence
- Modify: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.test.ts`
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Modify: `apps/control-plane/src/persistence/task-event-codec.ts`
- Modify: `apps/control-plane/src/persistence/task-event-codec.test.ts`
- Modify: `apps/control-plane/src/persistence/task-read-model.ts`
- Modify: `apps/control-plane/src/persistence/task-read-model.test.ts`

### Web Console
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/components/new-task-panel.tsx`
- Modify: `apps/web/src/components/approval-inbox-panel.tsx`
- Modify: `apps/web/src/components/task-detail-panel.tsx`
- Create: `apps/web/src/components/governance-panel.tsx`
- Create: `apps/web/src/components/revision-panel.tsx`
- Modify: `apps/web/src/styles.css`

### Browser Verification
- Modify: `apps/web/e2e/task-flow.spec.ts`

## Task 1: Extend Shared Governance Contracts And Review Branches

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `packages/orchestrator/src/task-machine.ts`
- Modify: `packages/orchestrator/src/task-machine.test.ts`

- [ ] **Step 1: Write the failing schema and state-machine tests**

```ts
import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  RecoveryStateSchema,
  TaskRecordSchema,
  TaskSpecSchema,
  TaskStatusSchema
} from "./index";

describe("contracts", () => {
  it("accepts a new task spec", () => {
    const result = TaskSpecSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      allowMock: true,
      requiresApproval: true,
      sensitivity: "medium"
    });

    expect(result.title).toBe("Build overview page");
  });

  it("contains the ACP approval checkpoint state", () => {
    expect(TaskStatusSchema.options).toContain("awaiting_approval");
  });

  it("accepts governance and revision metadata on a task record", () => {
    const result = TaskRecordSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      status: "needs_revision",
      artifacts: [],
      history: [],
      runIds: ["run-1"],
      approvalRunId: undefined,
      runs: [],
      governance: {
        requestedRequiresApproval: false,
        effectiveRequiresApproval: true,
        allowMock: true,
        sensitivity: "high",
        executionMode: "real_with_mock_fallback",
        policyReasons: ["high sensitivity forced approval"],
        reviewVerdict: "needs_revision",
        allowedActions: ["revise"],
        revisionCount: 1
      },
      revisionRequest: {
        note: "Clarify rollback expectations.",
        reviewerReasons: ["critic-agent requested tighter rollback language"],
        createdAt: "2026-04-04T00:00:00.000Z"
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    expect(result.governance.allowedActions).toEqual(["revise"]);
    expect(result.revisionRequest?.reviewerReasons).toContain(
      "critic-agent requested tighter rollback language"
    );
  });

  it("accepts audit event and recovery state metadata", () => {
    const recoveryState = RecoveryStateSchema.parse("healthy");
    const event = AuditEventSchema.parse({
      id: 1,
      streamType: "task",
      streamId: "task-1",
      eventType: "task.created",
      eventVersion: 1,
      occurredAt: "2026-04-03T00:00:00.000Z",
      payloadJson: { status: "draft" },
      metadataJson: { actorType: "control-plane" }
    });

    expect(recoveryState).toBe("healthy");
    expect(event.eventType).toBe("task.created");
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import type { TaskRecord } from "@feudal/contracts";
import { transitionTask } from "./task-machine";

const baseTask: TaskRecord = {
  id: "task-1",
  title: "Build overview page",
  prompt: "Create the dashboard",
  status: "draft",
  artifacts: [],
  history: [],
  runIds: [],
  runs: [],
  governance: {
    requestedRequiresApproval: true,
    effectiveRequiresApproval: true,
    allowMock: false,
    sensitivity: "medium",
    executionMode: "real",
    policyReasons: [],
    reviewVerdict: "approve",
    allowedActions: [],
    revisionCount: 0
  },
  createdAt: "2026-04-02T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z"
};

describe("transitionTask", () => {
  it("advances through the happy path", () => {
    const submitted = transitionTask(baseTask, { type: "task.submitted" });
    const planned = transitionTask(submitted, { type: "intake.completed" });

    expect(submitted.status).toBe("intake");
    expect(planned.status).toBe("planning");
  });

  it("routes review outcomes into revision, rejection, and direct dispatch", () => {
    const reviewTask = { ...baseTask, status: "review" as const };

    expect(
      transitionTask(reviewTask, { type: "review.revision_requested" }).status
    ).toBe("needs_revision");
    expect(transitionTask(reviewTask, { type: "review.rejected" }).status).toBe(
      "rejected"
    );
    expect(
      transitionTask(reviewTask, { type: "review.approved_without_approval" }).status
    ).toBe("dispatching");
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      transitionTask(baseTask, { type: "approval.granted" })
    ).toThrow("Illegal transition");
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts packages/orchestrator/src/task-machine.test.ts`

Expected: FAIL with schema errors about missing `governance` support and a state-machine error that `review.rejected` or `review.approved_without_approval` is not assignable.

- [ ] **Step 3: Add governance schemas and live review branches**

```ts
import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "draft",
  "intake",
  "planning",
  "review",
  "awaiting_approval",
  "dispatching",
  "executing",
  "verifying",
  "completed",
  "needs_revision",
  "partial_success",
  "rejected",
  "failed",
  "rolled_back"
]);

export const TaskActionSchema = z.enum(["approve", "reject", "revise"]);

export const ReviewVerdictSchema = z.enum([
  "approve",
  "needs_revision",
  "reject"
]);

export const GovernanceExecutionModeSchema = z.enum([
  "real",
  "real_with_mock_fallback",
  "mock_fallback_used"
]);

export const TaskGovernanceSchema = z.object({
  requestedRequiresApproval: z.boolean(),
  effectiveRequiresApproval: z.boolean(),
  allowMock: z.boolean(),
  sensitivity: z.enum(["low", "medium", "high"]),
  executionMode: GovernanceExecutionModeSchema,
  policyReasons: z.array(z.string()).default([]),
  reviewVerdict: ReviewVerdictSchema,
  allowedActions: z.array(TaskActionSchema).default([]),
  revisionCount: z.number().int().nonnegative().default(0)
});

export const TaskRevisionRequestSchema = z.object({
  note: z.string().min(1),
  reviewerReasons: z.array(z.string()).default([]),
  createdAt: z.string()
});

export const TaskRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  artifacts: z.array(TaskArtifactSchema),
  history: z.array(TaskHistoryEntrySchema),
  runIds: z.array(z.string()),
  approvalRunId: z.string().optional(),
  runs: z.array(ACPRunSummarySchema).default([]),
  approvalRequest: TaskApprovalRequestSchema.optional(),
  governance: TaskGovernanceSchema,
  revisionRequest: TaskRevisionRequestSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type TaskAction = z.infer<typeof TaskActionSchema>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type GovernanceExecutionMode = z.infer<typeof GovernanceExecutionModeSchema>;
export type TaskGovernance = z.infer<typeof TaskGovernanceSchema>;
export type TaskRevisionRequest = z.infer<typeof TaskRevisionRequestSchema>;
```

```ts
import type { TaskRecord, TaskStatus } from "@feudal/contracts";

export type TaskEvent =
  | { type: "task.submitted" }
  | { type: "intake.completed" }
  | { type: "planning.completed" }
  | { type: "review.approved" }
  | { type: "review.approved_without_approval" }
  | { type: "review.rejected" }
  | { type: "review.revision_requested" }
  | { type: "revision.submitted" }
  | { type: "approval.granted" }
  | { type: "approval.rejected" }
  | { type: "dispatch.completed" }
  | { type: "execution.completed" }
  | { type: "execution.failed" }
  | { type: "verification.passed" }
  | { type: "verification.partial" }
  | { type: "verification.failed" };

const transitions: Record<TaskStatus, Partial<Record<TaskEvent["type"], TaskStatus>>> = {
  draft: { "task.submitted": "intake" },
  intake: { "intake.completed": "planning" },
  planning: { "planning.completed": "review" },
  review: {
    "review.approved": "awaiting_approval",
    "review.approved_without_approval": "dispatching",
    "review.rejected": "rejected",
    "review.revision_requested": "needs_revision"
  },
  needs_revision: { "revision.submitted": "planning" },
  awaiting_approval: {
    "approval.granted": "dispatching",
    "approval.rejected": "rejected"
  },
  dispatching: { "dispatch.completed": "executing" },
  executing: {
    "execution.completed": "verifying",
    "execution.failed": "failed"
  },
  verifying: {
    "verification.passed": "completed",
    "verification.partial": "partial_success",
    "verification.failed": "failed"
  },
  completed: {},
  partial_success: {},
  rejected: {},
  failed: {},
  rolled_back: {}
};

export function transitionTask(task: TaskRecord, event: TaskEvent): TaskRecord {
  const nextStatus = transitions[task.status]?.[event.type];

  if (!nextStatus) {
    throw new Error(`Illegal transition from ${task.status} via ${event.type}`);
  }

  const now = new Date().toISOString();

  return {
    ...task,
    status: nextStatus,
    updatedAt: now,
    history: [...task.history, { status: nextStatus, at: now, note: event.type }]
  };
}
```

- [ ] **Step 4: Run the focused tests again**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts packages/orchestrator/src/task-machine.test.ts`

Expected: PASS with `2 passed` files and no schema failures.

- [ ] **Step 5: Commit the shared governance contract changes**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts packages/orchestrator/src/task-machine.ts packages/orchestrator/src/task-machine.test.ts
git commit -m "feat: add governance task contracts"
```

## Task 2: Add The Governance Policy Layer

**Files:**
- Create: `apps/control-plane/src/governance/policy.ts`
- Create: `apps/control-plane/src/governance/policy.test.ts`

- [ ] **Step 1: Write the failing governance policy tests**

```ts
import { describe, expect, it } from "vitest";
import type { TaskRecord, TaskSpec } from "@feudal/contracts";
import {
  aggregateReviewVerdict,
  allowedActionsForStatus,
  createTaskGovernance,
  syncGovernance
} from "./policy";

const baseSpec: TaskSpec = {
  id: "task-1",
  title: "Governance task",
  prompt: "Route the workflow",
  allowMock: true,
  requiresApproval: false,
  sensitivity: "high"
};

const baseTask: TaskRecord = {
  id: "task-1",
  title: "Governance task",
  prompt: "Route the workflow",
  status: "needs_revision",
  artifacts: [],
  history: [],
  runIds: [],
  runs: [],
  governance: createTaskGovernance(baseSpec),
  revisionRequest: {
    note: "Add tighter rollback language.",
    reviewerReasons: ["critic-agent requested more explicit safety bounds"],
    createdAt: "2026-04-04T00:00:00.000Z"
  },
  createdAt: "2026-04-04T00:00:00.000Z",
  updatedAt: "2026-04-04T00:00:00.000Z"
};

describe("governance policy", () => {
  it("forces approval for high sensitivity tasks", () => {
    const governance = createTaskGovernance(baseSpec);

    expect(governance.effectiveRequiresApproval).toBe(true);
    expect(governance.policyReasons).toContain("high sensitivity forced approval");
    expect(governance.executionMode).toBe("real_with_mock_fallback");
  });

  it("prefers reject over revision over approval", () => {
    const reject = aggregateReviewVerdict([
      { reviewer: "auditor-agent", verdict: "approve", note: "Looks good." },
      { reviewer: "critic-agent", verdict: "reject", note: "Reject this run." }
    ]);
    const revise = aggregateReviewVerdict([
      { reviewer: "auditor-agent", verdict: "approve", note: "Looks good." },
      {
        reviewer: "critic-agent",
        verdict: "needs_revision",
        note: "Clarify rollback expectations."
      }
    ]);

    expect(reject.reviewVerdict).toBe("reject");
    expect(revise.reviewVerdict).toBe("needs_revision");
    expect(revise.revisionRequest?.reviewerReasons).toContain(
      "Clarify rollback expectations."
    );
  });

  it("derives human actions from task status", () => {
    expect(allowedActionsForStatus("awaiting_approval")).toEqual(["approve", "reject"]);
    expect(allowedActionsForStatus("needs_revision")).toEqual(["revise"]);
    expect(allowedActionsForStatus("completed")).toEqual([]);

    expect(syncGovernance(baseTask).governance.allowedActions).toEqual(["revise"]);
  });
});
```

- [ ] **Step 2: Run the policy tests to verify they fail**

Run: `pnpm exec vitest run apps/control-plane/src/governance/policy.test.ts`

Expected: FAIL with `Cannot find module './policy'`.

- [ ] **Step 3: Implement the governance policy helpers**

```ts
import type {
  TaskAction,
  TaskGovernance,
  TaskRecord,
  TaskRevisionRequest,
  TaskSpec
} from "@feudal/contracts";

export interface ReviewArtifactInput {
  reviewer: string;
  verdict?: string;
  note?: string;
}

export function createTaskGovernance(spec: TaskSpec): TaskGovernance {
  const effectiveRequiresApproval =
    spec.sensitivity === "high" ? true : spec.requiresApproval;
  const policyReasons =
    spec.sensitivity === "high" && !spec.requiresApproval
      ? ["high sensitivity forced approval"]
      : [];

  return {
    requestedRequiresApproval: spec.requiresApproval,
    effectiveRequiresApproval,
    allowMock: spec.allowMock,
    sensitivity: spec.sensitivity,
    executionMode: spec.allowMock ? "real_with_mock_fallback" : "real",
    policyReasons,
    reviewVerdict: "approve",
    allowedActions: [],
    revisionCount: 0
  };
}

export function allowedActionsForStatus(status: TaskRecord["status"]): TaskAction[] {
  if (status === "awaiting_approval") {
    return ["approve", "reject"];
  }

  if (status === "needs_revision") {
    return ["revise"];
  }

  return [];
}

export function syncGovernance(task: TaskRecord): TaskRecord {
  return {
    ...task,
    governance: {
      ...task.governance,
      allowedActions: allowedActionsForStatus(task.status)
    }
  };
}

export function aggregateReviewVerdict(reviews: ReviewArtifactInput[]): {
  reviewVerdict: TaskGovernance["reviewVerdict"];
  policyReasons: string[];
  revisionRequest?: TaskRevisionRequest;
} {
  const normalized = reviews.map((review) => ({
    reviewer: review.reviewer,
    verdict:
      review.verdict === "approve" ||
      review.verdict === "needs_revision" ||
      review.verdict === "reject"
        ? review.verdict
        : "needs_revision",
    note: review.note?.trim()
  }));

  const rejectReasons = normalized
    .filter((review) => review.verdict === "reject")
    .map((review) => `${review.reviewer}: ${review.note ?? "review rejected the task"}`);

  if (rejectReasons.length > 0) {
    return {
      reviewVerdict: "reject",
      policyReasons: rejectReasons
    };
  }

  const revisionReasons = normalized
    .filter((review) => review.verdict === "needs_revision")
    .map((review) =>
      review.note ?? `${review.reviewer} requested revision because verdict was invalid`
    );

  if (revisionReasons.length > 0) {
    return {
      reviewVerdict: "needs_revision",
      policyReasons: revisionReasons,
      revisionRequest: {
        note: revisionReasons[0] ?? "Revision requested.",
        reviewerReasons: revisionReasons,
        createdAt: new Date().toISOString()
      }
    };
  }

  return {
    reviewVerdict: "approve",
    policyReasons: []
  };
}
```

- [ ] **Step 4: Run the policy tests again**

Run: `pnpm exec vitest run apps/control-plane/src/governance/policy.test.ts`

Expected: PASS with `1 passed` file.

- [ ] **Step 5: Commit the policy layer**

```bash
git add apps/control-plane/src/governance/policy.ts apps/control-plane/src/governance/policy.test.ts
git commit -m "feat: add governance policy helpers"
```

## Task 3: Add Mock Review Markers And The Task Run Gateway

**Files:**
- Modify: `packages/acp/src/mock-client.ts`
- Modify: `packages/acp/src/mock-client.test.ts`
- Create: `apps/control-plane/src/services/task-run-gateway.ts`
- Create: `apps/control-plane/src/services/task-run-gateway.test.ts`

- [ ] **Step 1: Write the failing mock-runtime and fallback-gateway tests**

```ts
import { describe, expect, it } from "vitest";
import { createMockACPClient } from "./mock-client";

describe("mock ACP client", () => {
  it("lists manifests for the feudal agents", async () => {
    const client = createMockACPClient();
    const manifests = await client.listAgents();

    expect(manifests.map((item) => item.name)).toContain("intake-agent");
    expect(manifests.map((item) => item.name)).toContain("gongbu-executor");
  });

  it("supports await and resume for approval checkpoints", async () => {
    const client = createMockACPClient();
    const awaiting = await client.awaitExternalInput({
      label: "approval",
      prompt: "Approve the task?",
      actions: ["approve", "reject"]
    });

    expect(awaiting.status).toBe("awaiting");

    const completed = await client.respondToAwait(awaiting.id, {
      role: "user",
      content: "approve"
    });

    expect(completed.status).toBe("completed");
  });

  it("uses prompt markers to emit review verdicts for governance tests", async () => {
    const client = createMockACPClient();
    const revisionRun = await client.runAgent({
      agent: "auditor-agent",
      messages: [{ role: "user", content: "Governance #mock:needs_revision-once" }]
    });
    const rejectRun = await client.runAgent({
      agent: "critic-agent",
      messages: [{ role: "user", content: "Governance #mock:reject" }]
    });

    expect(revisionRun.artifacts[0]?.content).toMatchObject({
      verdict: "needs_revision"
    });
    expect(rejectRun.artifacts[0]?.content).toMatchObject({
      verdict: "reject"
    });
  });
});
```

```ts
import { describe, expect, it, vi } from "vitest";
import type { ACPClient } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createTaskRunGateway } from "./task-run-gateway";

describe("task run gateway", () => {
  it("falls back to mock once and latches mock mode for the rest of the task", async () => {
    const baseMock = createMockACPClient();
    const realClient: ACPClient = {
      ...baseMock,
      runAgent: vi.fn().mockRejectedValue(new Error("real ACP unavailable"))
    };
    const gateway = createTaskRunGateway({
      realClient,
      mockClient: createMockACPClient()
    });

    const first = await gateway.runAgent(
      { executionMode: "real_with_mock_fallback" },
      {
        agent: "analyst-agent",
        messages: [{ role: "user", content: "Plan the task" }]
      }
    );
    const second = await gateway.runAgent(
      { executionMode: first.executionMode },
      {
        agent: "critic-agent",
        messages: [{ role: "user", content: "Review the task" }]
      }
    );

    expect(first.executionMode).toBe("mock_fallback_used");
    expect(second.executionMode).toBe("mock_fallback_used");
    expect(realClient.runAgent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused runtime tests to verify they fail**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts apps/control-plane/src/services/task-run-gateway.test.ts`

Expected: FAIL because the mock client does not yet emit revision markers and `./task-run-gateway` does not exist.

- [ ] **Step 3: Implement mock review markers and the gateway**

```ts
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

function joinedContent(messages: ACPMessage[]) {
  return messages.map((message) => message.content).join("\n");
}

function reviewVerdictFromMessages(messages: ACPMessage[]) {
  const content = joinedContent(messages);

  if (content.includes("#mock:reject")) {
    return "reject" as const;
  }

  if (
    content.includes("#mock:needs_revision") ||
    (content.includes("#mock:needs_revision-once") &&
      !content.includes("Revision note:"))
  ) {
    return "needs_revision" as const;
  }

  return "approve" as const;
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
          title: messages.at(-1)?.content ?? "Untitled task",
          prompt: messages.at(-1)?.content ?? "Untitled task"
        })
      ]
    };
  }

  if (agent === "analyst-agent") {
    const content = messages.at(-1)?.content ?? "Plan the task";
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("decision-brief", {
          summary: content,
          sourcePrompt: content
        })
      ]
    };
  }

  if (agent === "auditor-agent" || agent === "critic-agent") {
    const verdict = reviewVerdictFromMessages(messages);
    return {
      id,
      agent,
      status: "completed",
      messages,
      artifacts: [
        artifact("review", {
          verdict,
          reviewer: agent,
          note:
            verdict === "approve"
              ? `${agent} found no blocking issues in the task plan.`
              : verdict === "reject"
                ? `${agent} rejected the task plan.`
                : `${agent} requested revision before execution.`
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
```

```ts
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
  return mode === "mock_fallback_used" || !realClient;
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

    try {
      return {
        value: await work(options.realClient as ACPClient),
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
        : (options.realClient as ACPClient);

      return client.respondToAwait(runId, response);
    }
  };
}
```

- [ ] **Step 4: Run the focused runtime tests again**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts apps/control-plane/src/services/task-run-gateway.test.ts`

Expected: PASS with both files green and the fallback test showing one real attempt.

- [ ] **Step 5: Commit the runtime fallback support**

```bash
git add packages/acp/src/mock-client.ts packages/acp/src/mock-client.test.ts apps/control-plane/src/services/task-run-gateway.ts apps/control-plane/src/services/task-run-gateway.test.ts
git commit -m "feat: add ACP fallback gateway"
```

## Task 4: Refactor The Orchestrator Service Around Governance Decisions

**Files:**
- Modify: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.test.ts`

- [ ] **Step 1: Write the failing orchestrator workflow tests**

```ts
import { describe, expect, it } from "vitest";
import type { ACPClient } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createTaskRunGateway } from "./task-run-gateway";
import { createOrchestratorService } from "./orchestrator-service";

function createServiceWithClients(realClient: ACPClient, mockClient = createMockACPClient()) {
  return createOrchestratorService({
    runGateway: createTaskRunGateway({ realClient, mockClient })
  });
}

describe("orchestrator governance workflow", () => {
  it("skips approval when governance does not require it", async () => {
    const service = createServiceWithClients(createMockACPClient());
    const task = await service.createTask({
      id: "task-no-approval",
      title: "Fast path",
      prompt: "Ship a low sensitivity task",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });

    expect(task.status).toBe("completed");
    expect(task.governance.effectiveRequiresApproval).toBe(false);
    expect(task.approvalRequest).toBeUndefined();
  });

  it("forces approval for high sensitivity tasks", async () => {
    const service = createServiceWithClients(createMockACPClient());
    const task = await service.createTask({
      id: "task-high",
      title: "Sensitive task",
      prompt: "Touch production secrets",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "high"
    });

    expect(task.status).toBe("awaiting_approval");
    expect(task.governance.effectiveRequiresApproval).toBe(true);
    expect(task.governance.policyReasons).toContain(
      "high sensitivity forced approval"
    );
    expect(task.governance.allowedActions).toEqual(["approve", "reject"]);
  });

  it("re-enters planning from revision requests and latches mock fallback", async () => {
    const realClient: ACPClient = {
      ...createMockACPClient(),
      async runAgent() {
        throw new Error("real ACP unavailable");
      }
    };
    const service = createServiceWithClients(realClient);
    const created = await service.createTask({
      id: "task-revision",
      title: "Governance drill",
      prompt: "Exercise the workflow #mock:needs_revision-once",
      allowMock: true,
      requiresApproval: false,
      sensitivity: "high"
    });

    expect(created.status).toBe("needs_revision");
    expect(created.governance.executionMode).toBe("mock_fallback_used");
    expect(created.governance.allowedActions).toEqual(["revise"]);

    const revised = await service.submitRevision(
      created.id,
      "Revision note: tighten rollback scope and add acceptance criteria."
    );

    expect(revised.governance.revisionCount).toBe(1);
    expect(revised.status).toBe("awaiting_approval");
    expect(revised.governance.allowedActions).toEqual(["approve", "reject"]);
  });
});
```

- [ ] **Step 2: Run the orchestrator tests to verify they fail**

Run: `pnpm exec vitest run apps/control-plane/src/services/orchestrator-service.test.ts`

Expected: FAIL because `runGateway` and `submitRevision()` do not exist and the service still always opens the approval gate.

- [ ] **Step 3: Implement the orchestrator governance workflow**

```ts
import type { ACPRun, ACPRunAgentInput } from "@feudal/acp";
import type {
  ACPRunSummary,
  TaskAction,
  TaskArtifact,
  TaskRecord,
  TaskSpec
} from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import {
  aggregateReviewVerdict,
  createTaskGovernance,
  syncGovernance
} from "../governance/policy";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import { MemoryTaskStore, type TaskStore } from "../store";
import type { TaskRunContext, TaskRunGateway } from "./task-run-gateway";

export class ActionNotAllowedError extends Error {}

export interface OrchestratorService {
  createTask(spec: TaskSpec): Promise<TaskProjectionRecord>;
  approveTask(taskId: string): Promise<TaskProjectionRecord>;
  rejectTask(taskId: string): Promise<TaskProjectionRecord>;
  submitRevision(taskId: string, note: string): Promise<TaskProjectionRecord>;
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  listTaskEvents(taskId: string): ReturnType<TaskStore["listTaskEvents"]>;
  listTaskDiffs(taskId: string): ReturnType<TaskStore["listTaskDiffs"]>;
  listTaskRuns(taskId: string): ReturnType<TaskStore["listTaskRuns"]>;
  listTaskArtifacts(taskId: string): ReturnType<TaskStore["listTaskArtifacts"]>;
  replayTaskAtEventId(taskId: string, eventId: number): ReturnType<TaskStore["replayTaskAtEventId"]>;
  getRecoverySummary(): ReturnType<TaskStore["getRecoverySummary"]>;
  rebuildProjectionsIfNeeded(): ReturnType<TaskStore["rebuildProjectionsIfNeeded"]>;
  listAgents(): ReturnType<TaskRunGateway["listAgents"]>;
}

function ensureAllowedAction(task: TaskRecord, action: TaskAction) {
  if (!task.governance.allowedActions.includes(action)) {
    throw new ActionNotAllowedError(`Task ${task.id} does not allow ${action}`);
  }
}

function newTask(spec: TaskSpec): TaskProjectionRecord {
  const now = new Date().toISOString();

  return {
    id: spec.id,
    title: spec.title,
    prompt: spec.prompt,
    status: "draft",
    artifacts: [],
    history: [],
    runIds: [],
    runs: [],
    governance: createTaskGovernance(spec),
    revisionRequest: undefined,
    createdAt: now,
    updatedAt: now,
    recoveryState: "healthy",
    latestEventId: 0,
    latestProjectionVersion: 0
  };
}

function readReview(run: ACPRun) {
  const artifact = (run.artifacts[0]?.content ?? {}) as {
    verdict?: string;
    note?: string;
  };

  return {
    reviewer: run.agent,
    verdict: artifact.verdict,
    note: artifact.note
  };
}

async function runStep(
  task: TaskRecord,
  context: TaskRunContext,
  runGateway: TaskRunGateway,
  input: ACPRunAgentInput
): Promise<{ task: TaskRecord; context: TaskRunContext; run: ACPRun }> {
  const result = await runGateway.runAgent(context, input);
  const usedFallback = result.executionMode !== task.governance.executionMode;

  return {
    run: result.value,
    context: { executionMode: result.executionMode },
    task: syncGovernance({
      ...task,
      governance: {
        ...task.governance,
        executionMode: result.executionMode,
        policyReasons: usedFallback
          ? [...task.governance.policyReasons, "real ACP failed, continued with mock fallback"]
          : task.governance.policyReasons
      }
    })
  };
}
```

```ts
export function createOrchestratorService(options: {
  runGateway: TaskRunGateway;
  store?: TaskStore;
}): OrchestratorService {
  const runGateway = options.runGateway;
  const store = options.store ?? new MemoryTaskStore();

  async function runPlanningReviewAndBranch(
    task: TaskRecord,
    context: TaskRunContext,
    persistTask: (taskSnapshot: TaskRecord, eventType: string) => Promise<TaskProjectionRecord>
  ) {
    const analyst = await runStep(task, context, runGateway, {
      agent: "analyst-agent",
      messages: [{ role: "user", content: task.prompt }],
      metadata: { taskId: task.id }
    });
    let nextTask = transitionTask(analyst.task, { type: "planning.completed" });
    const reviewInput = JSON.stringify(analyst.run.artifacts[0]?.content);

    const auditor = await runStep(nextTask, analyst.context, runGateway, {
      agent: "auditor-agent",
      messages: [{ role: "agent/analyst-agent", content: reviewInput }],
      metadata: { taskId: task.id }
    });
    const critic = await runStep(auditor.task, auditor.context, runGateway, {
      agent: "critic-agent",
      messages: [{ role: "agent/analyst-agent", content: reviewInput }],
      metadata: { taskId: task.id }
    });

    nextTask = syncGovernance({
      ...critic.task,
      artifacts: [
        ...critic.task.artifacts,
        toTaskArtifact(analyst.run.id, "decision-brief", analyst.run.artifacts[0]?.content),
        toTaskArtifact(auditor.run.id, "review", auditor.run.artifacts[0]?.content),
        toTaskArtifact(critic.run.id, "review", critic.run.artifacts[0]?.content)
      ],
      runIds: [...critic.task.runIds, analyst.run.id, auditor.run.id, critic.run.id],
      runs: [
        ...critic.task.runs,
        toRunSummary(analyst.run, "planning"),
        toRunSummary(auditor.run, "review"),
        toRunSummary(critic.run, "review")
      ]
    });

    const aggregation = aggregateReviewVerdict([
      readReview(auditor.run),
      readReview(critic.run)
    ]);

    nextTask = syncGovernance({
      ...nextTask,
      governance: {
        ...nextTask.governance,
        reviewVerdict: aggregation.reviewVerdict,
        policyReasons: [...nextTask.governance.policyReasons, ...aggregation.policyReasons]
      },
      revisionRequest: aggregation.revisionRequest
    });

    if (aggregation.reviewVerdict === "reject") {
      return persistTask(
        transitionTask(nextTask, { type: "review.rejected" }),
        "task.review_rejected"
      );
    }

    if (aggregation.reviewVerdict === "needs_revision") {
      if (nextTask.governance.revisionCount >= 2) {
        return persistTask(
          syncGovernance({
            ...transitionTask(nextTask, { type: "review.rejected" }),
            governance: {
              ...nextTask.governance,
              policyReasons: [...nextTask.governance.policyReasons, "revision limit reached"]
            },
            revisionRequest: undefined
          }),
          "task.review_rejected"
        );
      }

      return persistTask(
        syncGovernance(
          transitionTask(nextTask, { type: "review.revision_requested" })
        ),
        "task.review_revision_requested"
      );
    }

    if (nextTask.governance.effectiveRequiresApproval) {
      const approval = await runGateway.awaitExternalInput(critic.context, {
        label: "approval-gate",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"],
        metadata: { taskId: task.id }
      });

      return persistTask(
        syncGovernance({
          ...transitionTask(nextTask, { type: "review.approved" }),
          approvalRunId: approval.value.id,
          approvalRequest: {
            runId: approval.value.id,
            prompt: approval.value.awaitPrompt ?? "Approve the decision brief?",
            actions: approval.value.allowedActions ?? ["approve", "reject"]
          },
          governance: {
            ...nextTask.governance,
            executionMode: approval.executionMode
          },
          runIds: [...nextTask.runIds, approval.value.id],
          runs: [...nextTask.runs, toRunSummary(approval.value, "approval")]
        }),
        "task.awaiting_approval"
      );
    }

    return executeApprovedTask(
      syncGovernance(
        transitionTask(nextTask, { type: "review.approved_without_approval" })
      ),
      critic.context,
      persistTask
    );
  }
```

```ts
  async function executeApprovedTask(
    task: TaskRecord,
    context: TaskRunContext,
    persistTask: (taskSnapshot: TaskRecord, eventType: string) => Promise<TaskProjectionRecord>
  ) {
    const executor = await runStep(task, context, runGateway, {
      agent: "gongbu-executor",
      messages: [{ role: "user", content: task.prompt }],
      metadata: { taskId: task.id }
    });

    let nextTask = transitionTask(executor.task, { type: "dispatch.completed" });
    nextTask = transitionTask(nextTask, { type: "execution.completed" });

    const verifier = await runStep(nextTask, executor.context, runGateway, {
      agent: "xingbu-verifier",
      messages: [
        {
          role: "agent/gongbu-executor",
          content: JSON.stringify(executor.run.artifacts[0]?.content)
        }
      ],
      metadata: { taskId: task.id }
    });

    const verifierArtifact = (verifier.run.artifacts[0]?.content ?? {}) as {
      result?: string;
      blockingIssues?: string[];
    };

    nextTask =
      verifierArtifact.blockingIssues && verifierArtifact.blockingIssues.length > 0
        ? transitionTask(verifier.task, { type: "verification.failed" })
        : verifierArtifact.result === "verified"
          ? transitionTask(verifier.task, { type: "verification.passed" })
          : transitionTask(verifier.task, { type: "verification.partial" });

    return persistTask(
      syncGovernance({
        ...nextTask,
        artifacts: [
          ...nextTask.artifacts,
          toTaskArtifact(executor.run.id, "execution-report", executor.run.artifacts[0]?.content),
          toTaskArtifact(verifier.run.id, "execution-report", verifier.run.artifacts[0]?.content)
        ],
        runIds: [...nextTask.runIds, executor.run.id, verifier.run.id],
        runs: [
          ...nextTask.runs,
          toRunSummary(executor.run, "execution"),
          toRunSummary(verifier.run, "verification")
        ]
      }),
      `task.${nextTask.status}`
    );
  }

  return {
    async createTask(spec) {
      let task = syncGovernance(
        transitionTask(newTask(spec), { type: "task.submitted" })
      );
      let latestProjectionVersion = 0;
      const persistTask = async (taskSnapshot: TaskRecord, eventType: string) => {
        const projection = await store.saveTask(
          taskSnapshot,
          eventType,
          latestProjectionVersion
        );
        latestProjectionVersion = projection.latestProjectionVersion;
        return projection;
      };

      await persistTask(task, "task.submitted");

      const intake = await runStep(task, { executionMode: task.governance.executionMode }, runGateway, {
        agent: "intake-agent",
        messages: [{ role: "user", content: spec.prompt }],
        metadata: { taskId: spec.id }
      });

      task = syncGovernance({
        ...transitionTask(intake.task, { type: "intake.completed" }),
        artifacts: [toTaskArtifact(intake.run.id, "taskspec", intake.run.artifacts[0]?.content)],
        runIds: [intake.run.id],
        runs: [toRunSummary(intake.run, "intake")]
      });
      await persistTask(task, "task.intake_completed");

      return runPlanningReviewAndBranch(task, intake.context, persistTask);
    },

    async approveTask(taskId) {
      const current = await store.getTask(taskId);
      if (!current || !current.approvalRunId) {
        throw new ActionNotAllowedError(`Task ${taskId} does not allow approve`);
      }

      ensureAllowedAction(current, "approve");
      let latestProjectionVersion = current.latestProjectionVersion;
      const persistTask = async (taskSnapshot: TaskRecord, eventType: string) => {
        const projection = await store.saveTask(
          taskSnapshot,
          eventType,
          latestProjectionVersion
        );
        latestProjectionVersion = projection.latestProjectionVersion;
        return projection;
      };

      const resumed = await runGateway.respondToAwait(
        { executionMode: current.governance.executionMode },
        current.approvalRunId,
        { role: "user", content: "approve" }
      );

      const approved = await persistTask(
        syncGovernance({
          ...transitionTask(current, { type: "approval.granted" }),
          approvalRunId: undefined,
          approvalRequest: undefined,
          runs: current.runs.map((run) =>
            run.id === resumed.id ? toRunSummary(resumed, "approval") : run
          )
        }),
        "task.approved"
      );

      return executeApprovedTask(approved, { executionMode: approved.governance.executionMode }, persistTask);
    },

    async rejectTask(taskId) {
      const current = await store.getTask(taskId);
      if (!current || !current.approvalRunId) {
        throw new ActionNotAllowedError(`Task ${taskId} does not allow reject`);
      }

      ensureAllowedAction(current, "reject");
      const resumed = await runGateway.respondToAwait(
        { executionMode: current.governance.executionMode },
        current.approvalRunId,
        { role: "user", content: "reject" }
      );

      return store.saveTask(
        syncGovernance({
          ...transitionTask(current, { type: "approval.rejected" }),
          approvalRunId: undefined,
          approvalRequest: undefined,
          runs: current.runs.map((run) =>
            run.id === resumed.id ? toRunSummary(resumed, "approval") : run
          )
        }),
        "task.rejected",
        current.latestProjectionVersion
      );
    },

    async submitRevision(taskId, note) {
      const current = await store.getTask(taskId);
      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      ensureAllowedAction(current, "revise");
      const revisionNote = note.trim();
      const revised = syncGovernance({
        ...transitionTask(current, { type: "revision.submitted" }),
        prompt: `${current.prompt}\nRevision note: ${revisionNote}`,
        revisionRequest: undefined,
        governance: {
          ...current.governance,
          revisionCount: current.governance.revisionCount + 1
        }
      });

      let latestProjectionVersion = current.latestProjectionVersion;
      const persistTask = async (taskSnapshot: TaskRecord, eventType: string) => {
        const projection = await store.saveTask(
          taskSnapshot,
          eventType,
          latestProjectionVersion
        );
        latestProjectionVersion = projection.latestProjectionVersion;
        return projection;
      };

      await persistTask(revised, "task.revision_submitted");
      return runPlanningReviewAndBranch(
        revised,
        { executionMode: revised.governance.executionMode },
        persistTask
      );
    },

    async listTasks() {
      return store.listTasks();
    },

    async getTask(taskId) {
      return store.getTask(taskId);
    },

    async listTaskEvents(taskId) {
      return store.listTaskEvents(taskId);
    },

    async listTaskDiffs(taskId) {
      return store.listTaskDiffs(taskId);
    },

    async listTaskRuns(taskId) {
      return store.listTaskRuns(taskId);
    },

    async listTaskArtifacts(taskId) {
      return store.listTaskArtifacts(taskId);
    },

    async replayTaskAtEventId(taskId, eventId) {
      return store.replayTaskAtEventId(taskId, eventId);
    },

    async getRecoverySummary() {
      return store.getRecoverySummary();
    },

    async rebuildProjectionsIfNeeded() {
      await store.rebuildProjectionsIfNeeded();
    },

    async listAgents() {
      return runGateway.listAgents();
    }
  };
}
```

```ts
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createTaskRunGateway } from "./services/task-run-gateway";

export function createTaskRunGatewayFromEnv() {
  const baseUrl = process.env.ACP_BASE_URL ?? "http://127.0.0.1:4100";
  const mode = process.env.FEUDAL_ACP_MODE ?? "http";
  const mockClient = createMockACPClient();

  if (mode === "mock") {
    return createTaskRunGateway({ mockClient });
  }

  return createTaskRunGateway({
    realClient: createHttpACPClient({ baseUrl }),
    mockClient
  });
}

export const defaultOrchestratorService = createOrchestratorService({
  runGateway: createTaskRunGatewayFromEnv(),
  store: createLazyTaskStore()
});
```

- [ ] **Step 4: Run the orchestrator tests again**

Run: `pnpm exec vitest run apps/control-plane/src/services/orchestrator-service.test.ts`

Expected: PASS with the new approval-skip, forced-approval, revision, and fallback coverage.

- [ ] **Step 5: Commit the orchestrator refactor**

```bash
git add apps/control-plane/src/config.ts apps/control-plane/src/services/orchestrator-service.ts apps/control-plane/src/services/orchestrator-service.test.ts
git commit -m "feat: wire governance workflow orchestration"
```

## Task 5: Add Revision Routes And Persist Governance Projection Changes

**Files:**
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Modify: `apps/control-plane/src/persistence/task-event-codec.ts`
- Modify: `apps/control-plane/src/persistence/task-event-codec.test.ts`
- Modify: `apps/control-plane/src/persistence/task-read-model.ts`
- Modify: `apps/control-plane/src/persistence/task-read-model.test.ts`

- [ ] **Step 1: Write the failing route and persistence tests**

```ts
import { createTaskRunGateway } from "../services/task-run-gateway";

function createApp() {
  const service = createOrchestratorService({
    runGateway: createTaskRunGateway({
      realClient: createMockACPClient(),
      mockClient: createMockACPClient()
    })
  });
  const app = Fastify();
  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  return app;
}

it("accepts revision notes and returns the next governance branch", async () => {
  const app = createApp();

  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Governance drill",
      prompt: "Exercise the workflow #mock:needs_revision-once",
      allowMock: true,
      requiresApproval: false,
      sensitivity: "high"
    }
  });

  expect(created.statusCode).toBe(201);
  expect(created.json().status).toBe("needs_revision");

  const revised = await app.inject({
    method: "POST",
    url: `/api/tasks/${created.json().id}/revise`,
    payload: {
      note: "Revision note: tighten rollback scope."
    }
  });

  expect(revised.statusCode).toBe(200);
  expect(revised.json().status).toBe("awaiting_approval");
  expect(revised.json().governance.allowedActions).toEqual(["approve", "reject"]);
});

it("returns 409 for unsupported governance actions", async () => {
  const app = createApp();

  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Fast path",
      prompt: "Ship a low sensitivity task",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/tasks/${created.json().id}/revise`,
    payload: {
      note: "No-op revision"
    }
  });

  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({
    message: `Task ${created.json().id} does not allow revise`
  });
});
```

```ts
it("tracks governance and revision diffs alongside approval metadata", () => {
  const task = buildTaskRecord({
    status: "needs_revision",
    governance: {
      requestedRequiresApproval: false,
      effectiveRequiresApproval: true,
      allowMock: true,
      sensitivity: "high",
      executionMode: "mock_fallback_used",
      policyReasons: ["high sensitivity forced approval"],
      reviewVerdict: "needs_revision",
      allowedActions: ["revise"],
      revisionCount: 1
    },
    revisionRequest: {
      note: "Clarify rollback expectations.",
      reviewerReasons: ["critic-agent requested tighter rollback language"],
      createdAt: "2026-04-04T00:00:00.000Z"
    }
  });

  const [, diffEvent] = buildTaskEventInputs(task, "task.review_revision_requested");

  expect(diffEvent.payloadJson).toMatchObject({
    changedPaths: expect.arrayContaining([
      "/status",
      "/governance",
      "/revisionRequest"
    ])
  });
});
```

```ts
it("records revise operator actions and keeps governance data in rebuilt tasks", async () => {
  const { pool, readModel } = await createReadModel();

  await readModel.saveTask(
    {
      ...task,
      status: "planning",
      governance: {
        requestedRequiresApproval: false,
        effectiveRequiresApproval: true,
        allowMock: true,
        sensitivity: "high",
        executionMode: "mock_fallback_used",
        policyReasons: ["high sensitivity forced approval"],
        reviewVerdict: "approve",
        allowedActions: [],
        revisionCount: 1
      },
      revisionRequest: undefined,
      updatedAt: "2026-04-03T00:15:00.000Z"
    },
    "task.revision_submitted",
    0
  );

  const actionRows = (
    await pool.query(
      `select action_type, status
         from operator_actions
        where task_id = $1`,
      [task.id]
    )
  ).rows;

  expect(actionRows).toContainEqual({
    action_type: "revise",
    status: "applied"
  });

  await expect(readModel.getTask(task.id)).resolves.toMatchObject({
    governance: {
      executionMode: "mock_fallback_used",
      revisionCount: 1
    }
  });
});
```

- [ ] **Step 2: Run the focused route and persistence tests to verify they fail**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts apps/control-plane/src/persistence/task-event-codec.test.ts apps/control-plane/src/persistence/task-read-model.test.ts`

Expected: FAIL because `/revise` does not exist, `ActionNotAllowedError` is not mapped to `409`, and governance fields are not tracked in diff/operator-action projections.

- [ ] **Step 3: Add the revision route and persist governance diffs**

```ts
import type { FastifyInstance, FastifyReply } from "fastify";
import { TaskSpecSchema } from "@feudal/contracts";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import {
  ActionNotAllowedError,
  type OrchestratorService
} from "../services/orchestrator-service";

const TaskParamsSchema = z.object({ taskId: z.string() });
const RevisionInputSchema = z.object({
  note: z.string().trim().min(1)
});

async function sendActionResult(
  reply: FastifyReply,
  work: () => Promise<unknown>
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ActionNotAllowedError) {
      return reply.code(409).send({ message: error.message });
    }

    throw error;
  }
}

export function registerTaskRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/tasks", async () => service.listTasks());

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await service.getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return task;
  });

  app.post("/api/tasks", async (request, reply) => {
    const payload = TaskSpecSchema.parse({
      id: crypto.randomUUID(),
      ...request.body
    });

    const projection = await service.createTask(payload);
    return reply.code(201).send(projection);
  });

  app.post("/api/tasks/:taskId/approve", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    return sendActionResult(reply, () => service.approveTask(params.taskId));
  });

  app.post("/api/tasks/:taskId/reject", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    return sendActionResult(reply, () => service.rejectTask(params.taskId));
  });

  app.post("/api/tasks/:taskId/revise", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const payload = RevisionInputSchema.parse(request.body);
    return sendActionResult(reply, () =>
      service.submitRevision(params.taskId, payload.note)
    );
  });
}
```

```ts
const TRACKED_DIFF_FIELDS = [
  "status",
  "approvalRequest",
  "runs",
  "governance",
  "revisionRequest"
] as const;
```

```ts
async function appendOperatorAction(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  task: TaskRecord;
  eventType: string;
}) {
  const actionType =
    options.eventType === "task.approved"
      ? "approve"
      : options.eventType === "task.rejected"
        ? "reject"
        : options.eventType === "task.revision_submitted"
          ? "revise"
          : undefined;

  if (!actionType) {
    return;
  }

  await options.queryable.query(
    `insert into operator_actions (
       task_id, action_type, status, actor_id, actor_type, reason, payload_json, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [options.task.id, actionType, "applied", null, "user", null, {}, options.task.updatedAt]
  );
}
```

- [ ] **Step 4: Run the focused route and persistence tests again**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts apps/control-plane/src/persistence/task-event-codec.test.ts apps/control-plane/src/persistence/task-read-model.test.ts`

Expected: PASS with the revise route, `409` validation, governance diff tracking, and revise operator action coverage all green.

- [ ] **Step 5: Commit the route and persistence updates**

```bash
git add apps/control-plane/src/routes/tasks.ts apps/control-plane/src/routes/tasks.test.ts apps/control-plane/src/persistence/task-event-codec.ts apps/control-plane/src/persistence/task-event-codec.test.ts apps/control-plane/src/persistence/task-read-model.ts apps/control-plane/src/persistence/task-read-model.test.ts
git commit -m "feat: persist governance actions and revision routes"
```

## Task 6: Ship The Governance Console UI

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/components/new-task-panel.tsx`
- Modify: `apps/web/src/components/approval-inbox-panel.tsx`
- Modify: `apps/web/src/components/task-detail-panel.tsx`
- Create: `apps/web/src/components/governance-panel.tsx`
- Create: `apps/web/src/components/revision-panel.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing web API and UI tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviseTask } from "./api";

describe("reviseTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts revision notes to the governance route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "task-1",
          title: "Governance task",
          prompt: "Exercise the workflow",
          status: "awaiting_approval",
          artifacts: [],
          history: [],
          runIds: [],
          runs: [],
          governance: {
            requestedRequiresApproval: false,
            effectiveRequiresApproval: true,
            allowMock: true,
            sensitivity: "high",
            executionMode: "mock_fallback_used",
            policyReasons: ["high sensitivity forced approval"],
            reviewVerdict: "approve",
            allowedActions: ["approve", "reject"],
            revisionCount: 1
          },
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:05:00.000Z"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    await reviseTask("task-1", "Revision note: tighten rollback scope.");

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/revise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        note: "Revision note: tighten rollback scope."
      })
    });
  });
});
```

```ts
const defaultTask: TaskRecord = {
  id: "task-1",
  title: "Build dashboard",
  prompt: "Create dashboard",
  status: "awaiting_approval",
  artifacts: [
    {
      id: "artifact-1",
      kind: "decision-brief",
      name: "decision-brief.json",
      mimeType: "application/json",
      content: { summary: "Review and execute the dashboard task." }
    }
  ],
  history: [
    {
      status: "awaiting_approval",
      at: "2026-04-02T14:00:00.000Z",
      note: "review.approved"
    }
  ],
  runIds: ["run-1"],
  approvalRunId: "await-1",
  runs: [
    {
      id: "run-1",
      agent: "analyst-agent",
      status: "completed",
      phase: "planning"
    }
  ],
  approvalRequest: {
    runId: "await-1",
    prompt: "Approve the decision brief?",
    actions: ["approve", "reject"]
  },
  governance: {
    requestedRequiresApproval: true,
    effectiveRequiresApproval: true,
    allowMock: false,
    sensitivity: "medium",
    executionMode: "real",
    policyReasons: [],
    reviewVerdict: "approve",
    allowedActions: ["approve", "reject"],
    revisionCount: 0
  },
  createdAt: "2026-04-02T14:00:00.000Z",
  updatedAt: "2026-04-02T14:00:00.000Z"
};

function mockConsoleApi(options?: {
  initialTasks?: TaskRecord[];
  revisedTask?: TaskRecord;
}) {
  let tasks = options?.initialTasks ?? [defaultTask];
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/tasks") && method === "GET") {
      return json(tasks);
    }

    if (url.endsWith("/api/agents") && method === "GET") {
      return json([
        {
          name: "gongbu-executor",
          role: "工部",
          description: "Executes approved assignments.",
          capabilities: ["assignment", "execution-report"]
        }
      ]);
    }

    if (url.endsWith("/api/recovery/summary") && method === "GET") {
      return json({
        tasksNeedingRecovery: 0,
        runsNeedingRecovery: 0
      });
    }

    if (url.endsWith(`/api/tasks/${defaultTask.id}/events`) && method === "GET") {
      return json([]);
    }

    if (url.endsWith(`/api/tasks/${defaultTask.id}/diffs`) && method === "GET") {
      return json([]);
    }

    if (url.endsWith(`/api/tasks/${defaultTask.id}/revise`) && method === "POST") {
      const revisedTask = options?.revisedTask ?? defaultTask;
      tasks = tasks.map((task) => (task.id === revisedTask.id ? revisedTask : task));
      return json(revisedTask);
    }

    return json([]);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("shows governance details and the forced approval warning", async () => {
  mockConsoleApi({
    initialTasks: [
      {
        ...defaultTask,
        status: "needs_revision",
        approvalRunId: undefined,
        approvalRequest: undefined,
        governance: {
          requestedRequiresApproval: false,
          effectiveRequiresApproval: true,
          allowMock: true,
          sensitivity: "high",
          executionMode: "mock_fallback_used",
          policyReasons: ["high sensitivity forced approval"],
          reviewVerdict: "needs_revision",
          allowedActions: ["revise"],
          revisionCount: 0
        },
        revisionRequest: {
          note: "Clarify rollback expectations.",
          reviewerReasons: ["critic-agent requested tighter rollback language"],
          createdAt: "2026-04-04T00:00:00.000Z"
        }
      }
    ]
  });

  render(<App />);

  expect(await screen.findByRole("heading", { name: "Governance Inbox" })).toBeVisible();
  expect(screen.getByText("high sensitivity forced approval")).toBeVisible();

  fireEvent.change(screen.getByLabelText("Sensitivity"), {
    target: { value: "high" }
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Require approval gate" }));

  expect(
    screen.getByText("High sensitivity tasks always require approval.")
  ).toBeVisible();
});

it("submits revision notes from task detail", async () => {
  const revisedTask: TaskRecord = {
    ...defaultTask,
    status: "awaiting_approval",
    governance: {
      ...defaultTask.governance,
      reviewVerdict: "approve",
      allowedActions: ["approve", "reject"],
      revisionCount: 1
    },
    revisionRequest: undefined,
    approvalRunId: "await-1",
    approvalRequest: {
      runId: "await-1",
      prompt: "Approve the decision brief?",
      actions: ["approve", "reject"]
    }
  };
  const fetchMock = mockConsoleApi({
    initialTasks: [
      {
        ...defaultTask,
        status: "needs_revision",
        approvalRunId: undefined,
        approvalRequest: undefined,
        governance: {
          ...defaultTask.governance,
          reviewVerdict: "needs_revision",
          allowedActions: ["revise"]
        },
        revisionRequest: {
          note: "Clarify rollback expectations.",
          reviewerReasons: ["critic-agent requested tighter rollback language"],
          createdAt: "2026-04-04T00:00:00.000Z"
        }
      }
    ],
    revisedTask
  });

  render(<App />);

  fireEvent.change(await screen.findByLabelText("Revision note"), {
    target: {
      value: "Revision note: tighten rollback scope."
    }
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit revision" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tasks/${defaultTask.id}/revise`,
      expect.objectContaining({ method: "POST" })
    )
  );
  expect(await screen.findByText("Approve the decision brief?")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused web tests to verify they fail**

Run: `pnpm exec vitest run apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx`

Expected: FAIL because `reviseTask()` does not exist, `defaultTask` lacks governance fields, and the UI does not yet render governance details or revision submission.

- [ ] **Step 3: Implement the governance API calls and UI panels**

```ts
export interface CreateTaskInput {
  title: string;
  prompt: string;
  allowMock: boolean;
  requiresApproval: boolean;
  sensitivity: "low" | "medium" | "high";
}

export async function reviseTask(taskId: string, note: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/revise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note })
  });
}
```

```tsx
interface NewTaskPanelProps {
  canSubmit: boolean;
  draft: CreateTaskInput;
  isSubmitting: boolean;
  onDraftChange: (
    field: "title" | "prompt" | "sensitivity",
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onAllowMockChange: (checked: boolean) => void;
  onRequiresApprovalChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

<label className="checkbox-field">
  <input
    checked={draft.allowMock}
    type="checkbox"
    name="allowMock"
    onChange={(event) => onAllowMockChange(event.target.checked)}
  />
  Allow mock fallback
</label>
<label className="checkbox-field">
  <input
    checked={draft.requiresApproval}
    type="checkbox"
    name="requiresApproval"
    onChange={(event) => onRequiresApprovalChange(event.target.checked)}
  />
  Require approval gate
</label>
{draft.sensitivity === "high" && !draft.requiresApproval ? (
  <small className="field-note">
    High sensitivity tasks always require approval.
  </small>
) : null}
```

```tsx
import type { TaskRecord } from "@feudal/contracts";

interface GovernancePanelProps {
  task: TaskRecord;
}

export function GovernancePanel({ task }: GovernancePanelProps) {
  return (
    <article>
      <h3>Governance</h3>
      <ul className="detail-list governance-list">
        <li>
          <strong>Sensitivity</strong>
          <span>{task.governance.sensitivity}</span>
        </li>
        <li>
          <strong>Approval</strong>
          <span>
            {task.governance.requestedRequiresApproval
              ? "requested"
              : "not requested"}{" "}
            / {task.governance.effectiveRequiresApproval ? "effective" : "skipped"}
          </span>
        </li>
        <li>
          <strong>Execution Mode</strong>
          <span>{task.governance.executionMode}</span>
        </li>
        <li>
          <strong>Review Verdict</strong>
          <span>{task.governance.reviewVerdict}</span>
        </li>
        <li>
          <strong>Revision Count</strong>
          <span>{task.governance.revisionCount}</span>
        </li>
      </ul>
      {task.governance.policyReasons.length > 0 ? (
        <ul className="detail-list">
          {task.governance.policyReasons.map((reason) => (
            <li key={reason}>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
```

```tsx
import type { FormEvent } from "react";
import type { TaskRecord } from "@feudal/contracts";

interface RevisionPanelProps {
  isSubmitting: boolean;
  note: string;
  onNoteChange: (nextValue: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  task: TaskRecord;
}

export function RevisionPanel(props: RevisionPanelProps) {
  const { isSubmitting, note, onNoteChange, onSubmit, task } = props;

  if (!task.governance.allowedActions.includes("revise")) {
    return null;
  }

  return (
    <article className="revision-panel">
      <h3>Revision Request</h3>
      <p>{task.revisionRequest?.note}</p>
      <ul className="detail-list">
        {(task.revisionRequest?.reviewerReasons ?? []).map((reason) => (
          <li key={reason}>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit}>
        <label>
          Revision note
          <textarea
            aria-label="Revision note"
            rows={4}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </label>
        <button disabled={isSubmitting || note.trim().length === 0} type="submit">
          {isSubmitting ? "Submitting revision..." : "Submit revision"}
        </button>
      </form>
    </article>
  );
}
```

```tsx
interface ApprovalInboxPanelProps {
  activeTaskId?: string;
  onApprove: (taskId: string) => void | Promise<void>;
  onReject: (taskId: string) => void | Promise<void>;
  tasks: TaskRecord[];
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeTaskId, onApprove, onReject, tasks } = props;

  return (
    <section className="panel panel-approval">
      <div className="panel-header">
        <h2>Governance Inbox</h2>
        <span>{tasks.length} waiting</span>
      </div>

      <ul className="detail-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.status}</span>
              {task.status === "needs_revision" ? (
                <small>Open Task Detail to submit a revision note.</small>
              ) : null}
              {task.approvalRequest ? (
                <>
                  <small>{`Prompt: ${task.approvalRequest.prompt}`}</small>
                  <small>{task.approvalRequest.actions.join(" / ")}</small>
                </>
              ) : null}
            </div>
            <div className="button-row">
              {task.governance.allowedActions.includes("approve") ? (
                <button
                  type="button"
                  disabled={activeTaskId === task.id}
                  onClick={() => void onApprove(task.id)}
                >
                  {activeTaskId === task.id
                    ? `Processing ${task.title}...`
                    : `Approve ${task.title}`}
                </button>
              ) : null}
              {task.governance.allowedActions.includes("reject") ? (
                <button
                  type="button"
                  disabled={activeTaskId === task.id}
                  onClick={() => void onReject(task.id)}
                >
                  {activeTaskId === task.id
                    ? `Processing ${task.title}...`
                    : `Reject ${task.title}`}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
import { startTransition, useEffect, useState } from "react";
import {
  approveTask,
  createTask,
  fetchAgents,
  fetchRecoverySummary,
  fetchTaskDiffs,
  fetchTaskEvents,
  fetchTaskReplay,
  fetchTasks,
  rejectTask,
  reviseTask,
  type CreateTaskInput,
  type RecoverySummary,
  type TaskConsoleRecord,
  type TaskDiffEntry,
  type TaskEventSummary
} from "./lib/api";

const [activeGovernanceId, setActiveGovernanceId] = useState<string>();
const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});

const governanceTasks = tasks.filter(
  (task) => task.governance.allowedActions.length > 0
);

async function handleRevisionSubmit(taskId: string) {
  const note = revisionDrafts[taskId]?.trim();

  if (!note) {
    return;
  }

  setActiveGovernanceId(taskId);

  try {
    const revisedTask = await reviseTask(taskId, note);

    startTransition(() => {
      upsertTask(revisedTask);
      setSelectedTaskId(revisedTask.id);
      setRevisionDrafts((current) => ({ ...current, [taskId]: "" }));
      setError(undefined);
    });
  } catch (nextError: unknown) {
    setError(
      nextError instanceof Error
        ? nextError.message
        : "Unable to submit the revision note."
    );
  } finally {
    setActiveGovernanceId(undefined);
  }
}

<NewTaskPanel
  canSubmit={canSubmit}
  draft={draft}
  isSubmitting={isSubmitting}
  onSubmit={handleTaskSubmit}
  onDraftChange={handleDraftChange}
  onAllowMockChange={(checked) =>
    setDraft((current) => ({ ...current, allowMock: checked }))
  }
  onRequiresApprovalChange={(checked) =>
    setDraft((current) => ({ ...current, requiresApproval: checked }))
  }
/>
<TaskDetailPanel
  laneLabels={laneLabels}
  selectedTask={selectedTask}
  revisionNote={selectedTask ? revisionDrafts[selectedTask.id] ?? "" : ""}
  onRevisionNoteChange={(value) => {
    if (!selectedTask) {
      return;
    }

    setRevisionDrafts((current) => ({ ...current, [selectedTask.id]: value }));
  }}
  onSubmitRevision={() =>
    selectedTask ? handleRevisionSubmit(selectedTask.id) : Promise.resolve()
  }
  revisionPending={activeGovernanceId === selectedTask?.id}
/>
<ApprovalInboxPanel
  activeTaskId={activeGovernanceId}
  onApprove={handleApprove}
  onReject={handleReject}
  tasks={governanceTasks}
/>
```

```css
.field-note {
  color: #7a5c00;
  font-size: 0.9rem;
}

.governance-list strong {
  min-width: 9rem;
  display: inline-block;
}

.revision-panel textarea {
  width: 100%;
  min-height: 7rem;
}
```

- [ ] **Step 4: Run the focused web tests again**

Run: `pnpm exec vitest run apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx`

Expected: PASS with the governance panel, revision submit flow, and forced-approval warning covered.

- [ ] **Step 5: Commit the web console changes**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts apps/web/src/app.tsx apps/web/src/app.test.tsx apps/web/src/components/new-task-panel.tsx apps/web/src/components/approval-inbox-panel.tsx apps/web/src/components/task-detail-panel.tsx apps/web/src/components/governance-panel.tsx apps/web/src/components/revision-panel.tsx apps/web/src/styles.css
git commit -m "feat: add governance console UI"
```

## Task 7: Add The Browser Scenario And Run Full Verification

**Files:**
- Modify: `apps/web/e2e/task-flow.spec.ts`

- [ ] **Step 1: Add the governance browser flow**

```ts
import { expect, test } from "@playwright/test";

test("drives one governance revision loop through approval and completion", async ({
  page
}) => {
  const title = "Governance revision drill";
  const prompt = "Exercise governance #mock:needs_revision-once";

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByLabel("Sensitivity").selectOption("high");
  await page
    .getByRole("checkbox", { name: "Require approval gate" })
    .uncheck();
  await page.getByRole("checkbox", { name: "Allow mock fallback" }).check();
  await page.getByRole("button", { name: "Submit task" }).click();

  await expect(page.getByRole("heading", { name: "Governance Inbox" })).toBeVisible();
  await expect(page.getByText("Needs Revision")).toBeVisible();
  await expect(page.getByText("high sensitivity forced approval")).toBeVisible();

  await page.getByLabel("Revision note").fill(
    "Revision note: tighten rollback scope and add acceptance criteria."
  );
  await page.getByRole("button", { name: "Submit revision" }).click();

  const approveButton = page.getByRole("button", { name: `Approve ${title}` });
  await expect(approveButton).toBeVisible();
  await approveButton.click();

  await expect(page.getByText("mock_fallback_used")).toBeVisible();
  await expect(page.getByText("Verifier accepted the execution report.")).toBeVisible();
  await expect(page.getByText("0 waiting")).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test**

Run: `pnpm --filter @feudal/web exec playwright test e2e/task-flow.spec.ts`

Expected: PASS with one browser test covering revision, forced approval, and completion.

- [ ] **Step 3: Run the full verification set**

Run: `pnpm exec vitest run --config vitest.config.ts`

Expected: PASS with the full workspace Vitest suite green.

Run: `pnpm --filter @feudal/web build`

Expected: PASS with the Vite production build succeeding.

Run: `pnpm --filter @feudal/web exec playwright test`

Expected: PASS with the governance browser flow green.

- [ ] **Step 4: Commit the browser coverage**

```bash
git add apps/web/e2e/task-flow.spec.ts
git commit -m "test: cover governance workflow e2e"
```
