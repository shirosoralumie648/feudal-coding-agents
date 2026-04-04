# Codex Feudal Cluster Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working vertical slice of the Codex feudal cluster: a single-user web console, deterministic control plane, ACP-backed mock agent runtime, and a visible `三省六部` task flow.

**Architecture:** Use a `pnpm` TypeScript monorepo with `apps/control-plane` for the deterministic orchestrator/API and `apps/web` for the browser console. Shared packages hold contracts, task-state logic, and ACP adapters. Keep all persistence in memory for Phase 1 so the team can prove the task lifecycle before adding durability or real agent infrastructure.

**Tech Stack:** TypeScript, pnpm workspace, Fastify, React, Vite, React Router, Zod, Vitest, Playwright

---

## Scope Note
This plan intentionally implements only `Phase 1: Skeleton` from the approved spec. Write separate plans for `Phase 2: Real collaboration loop` and `Phase 3: Governance enhancements` after this foundation is green.

## Planned File Structure
- `package.json`: root scripts and shared dev dependencies
- `pnpm-workspace.yaml`: workspace package discovery
- `tsconfig.base.json`: shared TypeScript compiler options
- `vitest.workspace.ts`: workspace-level test project list
- `apps/control-plane/package.json`: API app scripts
- `apps/control-plane/src/server.ts`: Fastify bootstrap
- `apps/control-plane/src/store.ts`: in-memory task/run storage
- `apps/control-plane/src/services/orchestrator-service.ts`: deterministic workflow service
- `apps/control-plane/src/routes/tasks.ts`: task create/read/approve/reject endpoints
- `apps/control-plane/src/routes/agents.ts`: ACP manifest listing endpoint
- `apps/control-plane/src/routes/tasks.test.ts`: Fastify route tests
- `apps/web/package.json`: web app scripts
- `apps/web/index.html`: Vite entry HTML
- `apps/web/vite.config.ts`: Vite React config
- `apps/web/vitest.config.ts`: jsdom test config
- `apps/web/playwright.config.ts`: Playwright runner config
- `apps/web/src/main.tsx`: React bootstrap
- `apps/web/src/App.tsx`: app shell and route layout
- `apps/web/src/api/client.ts`: HTTP client for control-plane APIs
- `apps/web/src/pages/OverviewPage.tsx`: dashboard
- `apps/web/src/pages/NewTaskPage.tsx`: task creation
- `apps/web/src/pages/TaskDetailPage.tsx`: timeline and artifact view
- `apps/web/src/pages/ApprovalInboxPage.tsx`: approval queue
- `apps/web/src/pages/AgentsPage.tsx`: registry view
- `apps/web/src/App.test.tsx`: shell and route smoke tests
- `apps/web/e2e/task-flow.spec.ts`: end-to-end happy-path scenario
- `packages/contracts/package.json`: shared domain types package
- `packages/contracts/src/index.ts`: task, artifact, and API schemas
- `packages/contracts/src/index.test.ts`: schema smoke tests
- `packages/orchestrator/package.json`: state-machine package
- `packages/orchestrator/src/task-machine.ts`: legal task transitions
- `packages/orchestrator/src/task-machine.test.ts`: transition tests
- `packages/acp/package.json`: ACP abstraction package
- `packages/acp/src/index.ts`: ACP types and client interface
- `packages/acp/src/mock-client.ts`: in-memory ACP implementation
- `packages/acp/src/mock-client.test.ts`: manifest/run/await tests

### Task 1: Bootstrap The Workspace And Shared Contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts`

- [ ] **Step 1: Create the workspace manifests**

```json
{
  "name": "feudal-coding-agents",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "dev": "pnpm --parallel --filter @feudal/control-plane --filter @feudal/web dev",
    "build": "pnpm --filter @feudal/web build",
    "test": "pnpm exec vitest run --config vitest.workspace.ts",
    "e2e": "pnpm --filter @feudal/web exec playwright test"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@feudal/contracts": ["packages/contracts/src/index.ts"],
      "@feudal/orchestrator": ["packages/orchestrator/src/task-machine.ts"],
      "@feudal/acp": ["packages/acp/src/index.ts"],
      "@feudal/acp/*": ["packages/acp/src/*"]
    }
  }
}
```

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/contracts",
  "packages/orchestrator",
  "packages/acp",
  "apps/control-plane",
  "apps/web"
]);
```

- [ ] **Step 2: Install the root dependencies**

Run: `pnpm install`

Expected: `Packages: ... done` and a fresh `pnpm-lock.yaml` in the repo root.

- [ ] **Step 3: Write the failing contracts smoke test**

```ts
import { describe, expect, it } from "vitest";
import { TaskSpecSchema, TaskStatusSchema } from "./index";

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
});
```

- [ ] **Step 4: Run the smoke test to verify it fails**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts`

Expected: FAIL with a module error such as `Cannot find module './index'`.

- [ ] **Step 5: Write the shared domain contracts**

```json
{
  "name": "@feudal/contracts",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

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

export const TaskArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "taskspec",
    "decision-brief",
    "review",
    "assignment",
    "execution-report"
  ]),
  name: z.string(),
  mimeType: z.string(),
  content: z.unknown()
});

export const TaskHistoryEntrySchema = z.object({
  status: TaskStatusSchema,
  at: z.string(),
  note: z.string()
});

export const TaskSpecSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  prompt: z.string().min(1),
  allowMock: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  sensitivity: z.enum(["low", "medium", "high"]).default("medium")
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
  createdAt: z.string(),
  updatedAt: z.string()
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
```

- [ ] **Step 6: Install the newly added workspace dependency**

Run: `pnpm install`

Expected: `zod` is added to the workspace lockfile and installed locally.

- [ ] **Step 7: Run the contracts test to verify it passes**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts packages/contracts
git commit -m "Add workspace bootstrap and shared contracts"
```

### Task 2: Build The Deterministic Task State Machine

**Files:**
- Create: `packages/orchestrator/package.json`
- Create: `packages/orchestrator/src/task-machine.ts`
- Test: `packages/orchestrator/src/task-machine.test.ts`

- [ ] **Step 1: Write the failing transition tests**

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

  it("rejects illegal transitions", () => {
    expect(() =>
      transitionTask(baseTask, { type: "approval.granted" })
    ).toThrow("Illegal transition");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/orchestrator/src/task-machine.test.ts`

Expected: FAIL with `Cannot find module './task-machine'`.

- [ ] **Step 3: Implement the task machine**

```json
{
  "name": "@feudal/orchestrator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@feudal/contracts": "workspace:*"
  }
}
```

```ts
import type { TaskRecord, TaskStatus } from "@feudal/contracts";

export type TaskEvent =
  | { type: "task.submitted" }
  | { type: "intake.completed" }
  | { type: "planning.completed" }
  | { type: "review.approved" }
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

- [ ] **Step 4: Run the transition tests to verify they pass**

Run: `pnpm exec vitest run packages/orchestrator/src/task-machine.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator
git commit -m "Add deterministic task state machine"
```

### Task 3: Add ACP Types And An In-Memory ACP Client

**Files:**
- Create: `packages/acp/package.json`
- Create: `packages/acp/src/index.ts`
- Create: `packages/acp/src/mock-client.ts`
- Test: `packages/acp/src/mock-client.test.ts`

- [ ] **Step 1: Write the failing ACP tests**

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
});
```

- [ ] **Step 2: Run the ACP tests to verify they fail**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts`

Expected: FAIL with `Cannot find module './mock-client'`.

- [ ] **Step 3: Implement ACP types and the mock client**

```json
{
  "name": "@feudal/acp",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

```ts
export type ACPRole = "user" | `agent/${string}`;

export interface ACPMessage {
  role: ACPRole;
  content: string;
}

export interface ACPArtifact {
  id: string;
  name: string;
  mimeType: string;
  content: unknown;
}

export interface ACPAgentManifest {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
}

export type ACPRunStatus = "running" | "awaiting" | "completed" | "failed";

export interface ACPRun {
  id: string;
  agent: string;
  status: ACPRunStatus;
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export interface ACPClient {
  listAgents(): Promise<ACPAgentManifest[]>;
  runAgent(input: {
    agent: string;
    messages: ACPMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<ACPRun>;
  awaitExternalInput(input: {
    label: string;
    prompt: string;
    actions: string[];
  }): Promise<ACPRun>;
  respondToAwait(runId: string, response: ACPMessage): Promise<ACPRun>;
  getRun(runId: string): Promise<ACPRun | undefined>;
}
```

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
```

- [ ] **Step 4: Run the ACP tests to verify they pass**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/acp
git commit -m "Add ACP abstractions and mock runtime"
```

### Task 4: Build The Control-Plane API And Workflow Service

**Files:**
- Create: `apps/control-plane/package.json`
- Create: `apps/control-plane/src/store.ts`
- Create: `apps/control-plane/src/services/orchestrator-service.ts`
- Create: `apps/control-plane/src/routes/tasks.ts`
- Create: `apps/control-plane/src/routes/agents.ts`
- Create: `apps/control-plane/src/server.ts`
- Test: `apps/control-plane/src/routes/tasks.test.ts`

- [ ] **Step 1: Write the failing API tests**

```ts
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerTaskRoutes } from "./tasks";
import { registerAgentRoutes } from "./agents";

describe("control-plane routes", () => {
  it("creates a task and stops at awaiting approval", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("awaiting_approval");
  });

  it("approves a task and drives it to completion", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const taskId = created.json().id;
    const approval = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts`

Expected: FAIL with missing route module errors.

- [ ] **Step 3: Implement the control-plane app and workflow service**

```json
{
  "name": "@feudal/control-plane",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@feudal/acp": "workspace:*",
    "@feudal/contracts": "workspace:*",
    "@feudal/orchestrator": "workspace:*",
    "fastify": "^5.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "tsx": "^4.20.0"
  }
}
```

```ts
import type { TaskRecord } from "@feudal/contracts";

export class MemoryStore {
  private readonly tasks = new Map<string, TaskRecord>();

  listTasks(): TaskRecord[] {
    return [...this.tasks.values()];
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  saveTask(task: TaskRecord): TaskRecord {
    this.tasks.set(task.id, task);
    return task;
  }
}
```

```ts
import { createMockACPClient } from "@feudal/acp/mock-client";
import type { TaskArtifact, TaskRecord, TaskSpec } from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import { MemoryStore } from "../store";

const acp = createMockACPClient();
const store = new MemoryStore();

function toTaskArtifact(runId: string, kind: TaskArtifact["kind"], content: unknown): TaskArtifact {
  return {
    id: runId,
    kind,
    name: `${kind}.json`,
    mimeType: "application/json",
    content
  };
}

function newTask(spec: TaskSpec): TaskRecord {
  const now = new Date().toISOString();

  return {
    id: spec.id,
    title: spec.title,
    prompt: spec.prompt,
    status: "draft",
    artifacts: [],
    history: [],
    runIds: [],
    createdAt: now,
    updatedAt: now
  };
}

export async function createTask(spec: TaskSpec): Promise<TaskRecord> {
  let task = transitionTask(newTask(spec), { type: "task.submitted" });

  const intakeRun = await acp.runAgent({
    agent: "intake-agent",
    messages: [{ role: "user", content: spec.prompt }]
  });
  task = transitionTask(task, { type: "intake.completed" });

  const analystRun = await acp.runAgent({
    agent: "analyst-agent",
    messages: [{ role: "agent/intake-agent", content: JSON.stringify(intakeRun.artifacts[0]?.content) }]
  });
  task = transitionTask(task, { type: "planning.completed" });

  const [auditorRun, criticRun] = await Promise.all([
    acp.runAgent({
      agent: "auditor-agent",
      messages: [{ role: "agent/analyst-agent", content: JSON.stringify(analystRun.artifacts[0]?.content) }]
    }),
    acp.runAgent({
      agent: "critic-agent",
      messages: [{ role: "agent/analyst-agent", content: JSON.stringify(analystRun.artifacts[0]?.content) }]
    })
  ]);

  task = transitionTask(task, { type: "review.approved" });

  const approvalRun = await acp.awaitExternalInput({
    label: "approval-gate",
    prompt: "Approve the decision brief?",
    actions: ["approve", "reject"]
  });

  task = {
    ...task,
    artifacts: [
      toTaskArtifact(intakeRun.id, "taskspec", intakeRun.artifacts[0]?.content),
      toTaskArtifact(analystRun.id, "decision-brief", analystRun.artifacts[0]?.content),
      toTaskArtifact(auditorRun.id, "review", auditorRun.artifacts[0]?.content),
      toTaskArtifact(criticRun.id, "review", criticRun.artifacts[0]?.content)
    ],
    runIds: [intakeRun.id, analystRun.id, auditorRun.id, criticRun.id, approvalRun.id],
    approvalRunId: approvalRun.id
  };

  return store.saveTask(task);
}

export async function approveTask(taskId: string): Promise<TaskRecord> {
  const current = store.getTask(taskId);

  if (!current || !current.approvalRunId) {
    throw new Error(`Task ${taskId} is not awaiting approval`);
  }

  await acp.respondToAwait(current.approvalRunId, {
    role: "user",
    content: "approve"
  });

  let task = transitionTask(current, { type: "approval.granted" });

  const executorRun = await acp.runAgent({
    agent: "gongbu-executor",
    messages: [{ role: "user", content: current.prompt }]
  });
  task = transitionTask(task, { type: "dispatch.completed" });
  task = transitionTask(task, { type: "execution.completed" });

  const verifierRun = await acp.runAgent({
    agent: "xingbu-verifier",
    messages: [{ role: "agent/gongbu-executor", content: JSON.stringify(executorRun.artifacts[0]?.content) }]
  });
  task = transitionTask(task, { type: "verification.passed" });

  task = {
    ...task,
    artifacts: [
      ...task.artifacts,
      toTaskArtifact(executorRun.id, "execution-report", executorRun.artifacts[0]?.content),
      toTaskArtifact(verifierRun.id, "execution-report", verifierRun.artifacts[0]?.content)
    ],
    runIds: [...task.runIds, executorRun.id, verifierRun.id]
  };

  return store.saveTask(task);
}

export function listTasks(): TaskRecord[] {
  return store.listTasks();
}

export function getTask(taskId: string): TaskRecord | undefined {
  return store.getTask(taskId);
}

export async function listAgents() {
  return acp.listAgents();
}
```

```ts
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { TaskSpecSchema } from "@feudal/contracts";
import { approveTask, createTask, getTask, listTasks } from "../services/orchestrator-service";

export function registerTaskRoutes(app: FastifyInstance) {
  app.get("/api/tasks", async () => listTasks());

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = getTask(params.taskId);

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

    const task = await createTask(payload);
    return reply.code(201).send(task);
  });

  app.post("/api/tasks/:taskId/approve", async (request) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    return approveTask(params.taskId);
  });
}
```

```ts
import type { FastifyInstance } from "fastify";
import { listAgents } from "../services/orchestrator-service";

export function registerAgentRoutes(app: FastifyInstance) {
  app.get("/api/agents", async () => listAgents());
}
```

```ts
import Fastify from "fastify";
import { registerAgentRoutes } from "./routes/agents";
import { registerTaskRoutes } from "./routes/tasks";

const app = Fastify({ logger: true });

registerAgentRoutes(app);
registerTaskRoutes(app);

const port = Number(process.env.PORT ?? 4000);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Install the control-plane dependencies**

Run: `pnpm install`

Expected: Fastify and tsx are added to the workspace lockfile.

- [ ] **Step 5: Run the control-plane tests to verify they pass**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 6: Smoke-test the API manually**

Run: `pnpm --filter @feudal/control-plane dev`

Expected: Fastify starts on `http://localhost:4000`.

Run: `curl -s http://localhost:4000/api/agents`

Expected: JSON array including `intake-agent` and `gongbu-executor`.

- [ ] **Step 7: Commit**

```bash
git add apps/control-plane
git commit -m "Add control-plane API and workflow service"
```

### Task 5: Build The Web Console Shell And Core Pages

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/pages/OverviewPage.tsx`
- Create: `apps/web/src/pages/NewTaskPage.tsx`
- Create: `apps/web/src/pages/TaskDetailPage.tsx`
- Create: `apps/web/src/pages/ApprovalInboxPage.tsx`
- Create: `apps/web/src/pages/AgentsPage.tsx`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write the failing web shell test**

```tsx
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./App";

describe("AppShell", () => {
  it("renders the primary navigation", () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.getByText("Overview")).toBeDefined();
    expect(screen.getByText("New Task")).toBeDefined();
    expect(screen.getByText("Approval Inbox")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the web shell test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/App.test.tsx`

Expected: FAIL with missing module errors for `./App`.

- [ ] **Step 3: Create the web app and route shell**

```json
{
  "name": "@feudal/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@feudal/contracts": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@testing-library/react": "^16.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.0.0",
    "vite": "^7.0.0"
  }
}
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codex Feudal Cluster</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
```

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom"
  }
});
```

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export async function listTasks() {
  const response = await fetch(`${API_BASE}/tasks`);
  return response.json();
}

export async function createTask(payload: {
  title: string;
  prompt: string;
  allowMock: boolean;
  requiresApproval: boolean;
  sensitivity: "low" | "medium" | "high";
}) {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}

export async function getTask(taskId: string) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`);
  return response.json();
}

export async function approveTask(taskId: string) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/approve`, {
    method: "POST"
  });

  return response.json();
}

export async function listAgents() {
  const response = await fetch(`${API_BASE}/agents`);
  return response.json();
}
```

```tsx
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { AgentsPage } from "./pages/AgentsPage";
import { ApprovalInboxPage } from "./pages/ApprovalInboxPage";
import { NewTaskPage } from "./pages/NewTaskPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";

export function AppShell() {
  return (
    <div>
      <header>
        <h1>Codex Feudal Cluster</h1>
        <nav>
          <Link to="/">Overview</Link>
          <Link to="/tasks/new">New Task</Link>
          <Link to="/approvals">Approval Inbox</Link>
          <Link to="/agents">Agents</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/tasks/new" element={<NewTaskPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/approvals" element={<ApprovalInboxPage />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
```

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTasks } from "../api/client";

export function OverviewPage() {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    listTasks().then(setTasks);
  }, []);

  return (
    <section>
      <h2>Overview</h2>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <Link to={`/tasks/${task.id}`}>{task.title}</Link> - {task.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTask } from "../api/client";

export function NewTaskPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const task = await createTask({
      title,
      prompt,
      allowMock: true,
      requiresApproval: true,
      sensitivity: "medium"
    });

    navigate(`/tasks/${task.id}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>New Task</h2>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <button type="submit">Create Task</button>
    </form>
  );
}
```

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTask } from "../api/client";

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const [task, setTask] = useState<any | null>(null);

  useEffect(() => {
    getTask(taskId).then(setTask);
  }, [taskId]);

  if (!task) return <p>Loading task...</p>;

  return (
    <section>
      <h2>{task.title}</h2>
      <p>Status: {task.status}</p>
      <h3>Timeline</h3>
      <ul>
        {task.history.map((entry: any, index: number) => (
          <li key={`${entry.status}-${index}`}>{entry.status} - {entry.note}</li>
        ))}
      </ul>
      <h3>Artifacts</h3>
      <ul>
        {task.artifacts.map((item: any) => (
          <li key={item.id}>{item.kind}</li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
import { useEffect, useState } from "react";
import { approveTask, listTasks } from "../api/client";

export function ApprovalInboxPage() {
  const [tasks, setTasks] = useState<any[]>([]);

  async function load() {
    const items = await listTasks();
    setTasks(items.filter((task: any) => task.status === "awaiting_approval"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <h2>Approval Inbox</h2>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title}
            <button
              type="button"
              onClick={async () => {
                await approveTask(task.id);
                await load();
              }}
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
import { useEffect, useState } from "react";
import { listAgents } from "../api/client";

export function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    listAgents().then(setAgents);
  }, []);

  return (
    <section>
      <h2>Agent Registry</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.name}>
            {agent.role}: {agent.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Install the web dependencies**

Run: `pnpm install`

Expected: React, Vite, Testing Library, and Playwright are added to the workspace lockfile.

- [ ] **Step 5: Run the web shell test to verify it passes**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/App.test.tsx`

Expected: PASS with `1 passed`.

- [ ] **Step 6: Smoke-test the web shell manually**

Run: `pnpm --filter @feudal/web dev`

Expected: Vite starts on `http://localhost:5173`.

Check: the header shows `Overview`, `New Task`, `Approval Inbox`, and `Agents`.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "Add web console shell and core pages"
```

### Task 6: Wire The Happy-Path Approval Flow End To End

**Files:**
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/web/src/pages/TaskDetailPage.tsx`
- Modify: `apps/web/src/pages/OverviewPage.tsx`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/task-flow.spec.ts`

- [ ] **Step 1: Write the failing E2E task-flow test**

```ts
import { expect, test } from "@playwright/test";

test("creates, approves, and completes a task", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/tasks/new");

  await page.getByLabel("Title").fill("Build overview page");
  await page.getByLabel("Prompt").fill("Create a dashboard for the control plane.");
  await page.getByRole("button", { name: "Create Task" }).click();

  await expect(page.getByText("Status: awaiting_approval")).toBeVisible();

  await page.goto("http://127.0.0.1:5173/approvals");
  await page.getByRole("button", { name: "Approve" }).click();

  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByText("completed")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test to verify it fails**

Run: `pnpm --filter @feudal/web exec playwright test e2e/task-flow.spec.ts`

Expected: FAIL because the app has no Playwright config or stable labels yet.

- [ ] **Step 3: Tighten the API and UI for the happy path**

```ts
// apps/control-plane/src/routes/tasks.ts
app.post("/api/tasks/:taskId/reject", async (request) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  return rejectTask(params.taskId);
});
```

```ts
// apps/control-plane/src/services/orchestrator-service.ts
export async function rejectTask(taskId: string): Promise<TaskRecord> {
  const current = store.getTask(taskId);

  if (!current) {
    throw new Error(`Task ${taskId} was not found`);
  }

  const task = transitionTask(current, { type: "approval.rejected" });
  return store.saveTask(task);
}
```

```tsx
// apps/web/src/pages/TaskDetailPage.tsx
{task.status === "awaiting_approval" ? (
  <p>Waiting for user approval in the Approval Inbox.</p>
) : null}
<pre>{JSON.stringify(task.artifacts, null, 2)}</pre>
```

```tsx
// apps/web/src/pages/OverviewPage.tsx
<ul aria-label="task-list">
  {tasks.map((task) => (
    <li key={task.id}>
      <Link to={`/tasks/${task.id}`}>{task.title}</Link>
      <strong>{task.status}</strong>
    </li>
  ))}
</ul>
```

- [ ] **Step 4: Add Playwright config and run the happy-path test**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: "http://127.0.0.1:5173"
  },
  webServer: [
    {
      command: "pnpm --filter @feudal/control-plane dev",
      url: "http://127.0.0.1:4000/api/agents",
      reuseExistingServer: true
    },
    {
      command: "pnpm --filter @feudal/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true
    }
  ]
});
```

Run: `pnpm --filter @feudal/web exec playwright test`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/src/routes/tasks.ts apps/control-plane/src/services/orchestrator-service.ts apps/web/src/pages/TaskDetailPage.tsx apps/web/src/pages/OverviewPage.tsx apps/web/e2e/task-flow.spec.ts apps/web/playwright.config.ts
git commit -m "Wire approval flow through the web console"
```

### Task 7: Add A Minimal Developer README For Phase 1

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the initial README with real setup instructions**

```md
# feudal-coding-agents

Phase 1 of the Codex feudal cluster: a single-user web console, deterministic control plane, and ACP-backed mock agent runtime.

## Apps
- `apps/control-plane`: Fastify API and orchestrator
- `apps/web`: React control console
- `packages/contracts`: shared domain schemas
- `packages/orchestrator`: task state machine
- `packages/acp`: ACP abstraction and in-memory runtime

## Commands
- `pnpm install`
- `pnpm dev`
- `pnpm test`
- `pnpm e2e`
```

- [ ] **Step 2: Run the full verification suite**

Run: `pnpm test`
Expected: PASS with all Vitest projects green.

Run: `pnpm e2e`
Expected: PASS with the browser task-flow scenario green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Phase 1 developer workflow"
```

## Self-Review
- Spec coverage: this plan covers the approved spec's `Phase 1: Skeleton` scope, including the web shell, control plane, state machine, ACP client layer, agent registry, and visible approval loop.
- Intentional gaps: `Phase 2` real Codex worker execution beyond the mock ACP runtime and `Phase 3` governance services are deferred into separate follow-up plans.
- Red-flag scan: no unresolved stubs or undefined task references remain in this file.
- Type consistency: `TaskSpec`, `TaskRecord`, `TaskStatus`, `ACPRun`, and `approvalRunId` are defined in earlier tasks before later tasks reference them.
