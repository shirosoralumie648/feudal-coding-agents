# Unified Governance Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded web and control-plane governance submission branches with one unified governance action path while keeping the legacy routes compatible.

**Architecture:** Add a canonical `submitGovernanceAction()` dispatcher in `OrchestratorService`, expose it through `POST /api/tasks/:taskId/governance-actions/:actionType`, and keep `/approve`, `/reject`, and `/revise` as thin wrappers. On the web side, add one `submitGovernanceAction()` API helper, render inbox buttons from `task.governance.allowedActions`, and fail closed when governance actions and approval-gate actions drift.

**Tech Stack:** TypeScript, Zod, Fastify, React 19, Vite, Vitest, Playwright

---

## File Map

- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
  - add `submitGovernanceAction(taskId, actionType, note?)`
  - make `approveTask`, `rejectTask`, and `submitRevision` delegate into the unified dispatcher
  - validate `approve` / `reject` against both `governance.allowedActions` and `approvalRequest.actions`
- Modify: `apps/control-plane/src/services/orchestrator-service.test.ts`
  - prove the unified dispatcher preserves current `approve`, `reject`, and `revise` behavior
  - prove mismatched approval actions reject safely
- Modify: `apps/control-plane/src/routes/tasks.ts`
  - add `POST /api/tasks/:taskId/governance-actions/:actionType`
  - keep legacy routes as compatibility wrappers over the unified dispatcher
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
  - add route coverage for unified `approve` / `revise`
  - add `400 / 404 / 409` coverage for the new route
  - keep legacy route coverage green
- Modify: `apps/web/src/lib/api.ts`
  - add `submitGovernanceAction(taskId, actionType, note?)`
  - make `approveTask`, `rejectTask`, and `reviseTask` delegate into the unified client helper
- Modify: `apps/web/src/lib/api.test.ts`
  - verify unified route paths and payload semantics
- Modify: `apps/web/src/components/approval-inbox-panel.tsx`
  - render dynamic inline governance actions from `allowedActions`
  - show a visible mismatch warning and disable inline actions when approval actions drift
- Modify: `apps/web/src/app.tsx`
  - replace separate approve/reject/revise handlers with one governance action handler
  - wire `ApprovalInboxPanel` through the unified action callback
- Modify: `apps/web/src/app.test.tsx`
  - update mock API routing to the unified governance endpoint
  - verify dynamic inbox rendering, unified revise submission, and mismatch degradation
- Modify: `apps/web/e2e/task-flow.spec.ts`
  - capture browser-side governance requests and assert the revision loop uses `/governance-actions/revise` and `/governance-actions/approve`

## Task 1: Unify Governance Action Dispatch In The Service Layer

**Files:**
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.test.ts`
- Test: `apps/control-plane/src/services/orchestrator-service.test.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
import type { TaskProjectionRecord } from "../persistence/task-read-model";

class MismatchedApprovalTaskStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    if (taskId !== "task-mismatch") {
      return super.getTask(taskId);
    }

    return {
      id: taskId,
      title: "Mismatched approval task",
      prompt: "Approve the mismatched task",
      status: "awaiting_approval",
      artifacts: [],
      history: [
        {
          status: "awaiting_approval",
          at: "2026-04-07T00:00:00.000Z",
          note: "review.approved"
        }
      ],
      runIds: ["run-approval"],
      approvalRunId: "run-approval",
      runs: [
        {
          id: "run-approval",
          agent: "approval-gate",
          status: "awaiting",
          phase: "approval",
          awaitPrompt: "Approve the decision brief?",
          allowedActions: ["reject"]
        }
      ],
      approvalRequest: {
        runId: "run-approval",
        prompt: "Approve the decision brief?",
        actions: ["reject"]
      },
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "medium",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "approved",
        allowedActions: ["approve", "reject"],
        revisionCount: 0
      },
      operatorAllowedActions: ["abandon"],
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      recoveryState: "healthy",
      latestEventId: 1,
      latestProjectionVersion: 1
    } satisfies TaskProjectionRecord;
  }
}

it("submits approve and revise through the unified governance dispatcher", async () => {
  const service = createServiceWithGateway();
  const approvalTask = await service.createTask({
    id: "task-governance-approve",
    title: "Approval task",
    prompt: "Approve this task",
    allowMock: false,
    requiresApproval: true,
    sensitivity: "medium"
  });

  const approved = await service.submitGovernanceAction(
    approvalTask.id,
    "approve"
  );

  expect(approved.status).toBe("completed");

  const revisionTask = await service.createTask({
    id: "task-governance-revise",
    title: "Revision task",
    prompt: "Exercise governance #mock:needs_revision-once",
    allowMock: true,
    requiresApproval: false,
    sensitivity: "high"
  });

  const revised = await service.submitGovernanceAction(
    revisionTask.id,
    "revise",
    "Tighten rollback scope and re-run review."
  );

  expect(revised.status).toBe("awaiting_approval");
  expect(revised.governance?.revisionCount).toBe(1);
});

it("rejects approval actions when approvalRequest.actions drift from governance.allowedActions", async () => {
  const service = createServiceWithGateway({
    store: new MismatchedApprovalTaskStore()
  });

  await expect(
    service.submitGovernanceAction("task-mismatch", "approve")
  ).rejects.toThrow("Task task-mismatch does not allow approve");
});
```

- [ ] **Step 2: Run the service tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/control-plane/src/services/orchestrator-service.test.ts --config vitest.config.ts
```

Expected:

```text
FAIL  apps/control-plane/src/services/orchestrator-service.test.ts
+ Property 'submitGovernanceAction' does not exist on type 'OrchestratorService'
```

- [ ] **Step 3: Implement the unified governance dispatcher**

```ts
function assertApprovalRequestActionAllowed(task: TaskRecord, action: TaskAction) {
  if (task.status !== "awaiting_approval" || action === "revise") {
    return;
  }

  const approvalActions = task.approvalRequest?.actions ?? [];

  if (!approvalActions.includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }
}

function assertGovernanceActionAllowed(task: TaskRecord, action: TaskAction) {
  const taskWithGovernance = syncGovernance(task);

  if (!allowedActions(taskWithGovernance).includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }

  assertApprovalRequestActionAllowed(taskWithGovernance, action);
}

async function submitGovernanceAction(
  taskId: string,
  action: TaskAction,
  note?: string
): Promise<TaskProjectionRecord> {
  const current = await store.getTask(taskId);

  if (!current) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (action === "approve") {
    assertGovernanceActionAllowed(current, "approve");

    if (!current.approvalRunId) {
      throw new Error(`Task ${taskId} is missing approval run state`);
    }

    const persistTask = createPersistTask({
      store,
      initialVersion: current.latestProjectionVersion
    });
    const resumedApprovalRun = await runGateway.respondToAwait(
      { executionMode: currentExecutionMode(current) },
      current.approvalRunId,
      {
        role: "user",
        content: "approve"
      }
    );

    let task = transitionTask(current, { type: "approval.granted" });
    task = updateExistingRunSummary(task, resumedApprovalRun, "approval");
    task = {
      ...task,
      approvalRunId: undefined,
      approvalRequest: undefined
    };
    await persistTask(task, "task.approved");

    return runExecutionAndVerification({
      task,
      persistTask,
      runMetadata: { taskId }
    });
  }

  if (action === "reject") {
    assertGovernanceActionAllowed(current, "reject");

    if (!current.approvalRunId) {
      throw new Error(`Task ${taskId} is missing approval run state`);
    }

    const persistTask = createPersistTask({
      store,
      initialVersion: current.latestProjectionVersion
    });
    const resumedApprovalRun = await runGateway.respondToAwait(
      { executionMode: currentExecutionMode(current) },
      current.approvalRunId,
      {
        role: "user",
        content: "reject"
      }
    );

    let task = transitionTask(current, { type: "approval.rejected" });
    task = updateExistingRunSummary(task, resumedApprovalRun, "approval");
    task = {
      ...task,
      approvalRunId: undefined,
      approvalRequest: undefined
    };

    return persistTask(task, "task.rejected");
  }

  const trimmedNote = note?.trim() ?? "";

  if (trimmedNote.length === 0) {
    throw new Error("Revision note must not be empty");
  }

  assertGovernanceActionAllowed(current, "revise");

  const persistTask = createPersistTask({
    store,
    initialVersion: current.latestProjectionVersion
  });
  const governance = ensureGovernance(current);
  let task = transitionTask(current, { type: "revision.submitted" });
  task = {
    ...task,
    governance: {
      ...governance,
      reviewVerdict: "pending",
      revisionCount: governance.revisionCount + 1
    },
    revisionRequest: undefined
  };
  await persistTask(task, "task.revision_submitted");

  return runPlanningReviewAndBranch({
    task,
    persistTask,
    runMetadata: { taskId },
    revisionNote: trimmedNote
  });
}

export interface OrchestratorService {
  createTask(spec: TaskSpec): Promise<TaskProjectionRecord>;
  submitGovernanceAction(
    taskId: string,
    action: TaskAction,
    note?: string
  ): Promise<TaskProjectionRecord>;
  approveTask(taskId: string): Promise<TaskProjectionRecord>;
  rejectTask(taskId: string): Promise<TaskProjectionRecord>;
  submitRevision(taskId: string, note: string): Promise<TaskProjectionRecord>;
}

return {
  async submitGovernanceAction(taskId, action, note) {
    return submitGovernanceAction(taskId, action, note);
  },

  async approveTask(taskId) {
    return submitGovernanceAction(taskId, "approve");
  },

  async rejectTask(taskId) {
    return submitGovernanceAction(taskId, "reject");
  },

  async submitRevision(taskId, note) {
    return submitGovernanceAction(taskId, "revise", note);
  },
```

- [ ] **Step 4: Re-run the service tests and verify they pass**

Run:

```bash
pnpm exec vitest run apps/control-plane/src/services/orchestrator-service.test.ts --config vitest.config.ts
```

Expected:

```text
PASS  apps/control-plane/src/services/orchestrator-service.test.ts
```

- [ ] **Step 5: Commit the service unification**

```bash
git add apps/control-plane/src/services/orchestrator-service.ts apps/control-plane/src/services/orchestrator-service.test.ts
git commit -m "refactor: unify governance action service dispatch"
```

## Task 2: Add The Unified Governance Route And Keep Legacy Routes Compatible

**Files:**
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Test: `apps/control-plane/src/routes/tasks.test.ts`

- [ ] **Step 1: Write the failing route tests**

```ts
it("submits governance actions through the unified route", async () => {
  const app = createApp();
  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Unified approval task",
      prompt: "Approve this task",
      allowMock: true,
      requiresApproval: true,
      sensitivity: "medium"
    }
  });

  const approved = await app.inject({
    method: "POST",
    url: `/api/tasks/${created.json().id}/governance-actions/approve`,
    payload: {}
  });

  expect(approved.statusCode).toBe(200);
  expect(approved.json().status).toBe("completed");
});

it("returns 400 when revise is submitted through the unified route without a note", async () => {
  const app = createApp();
  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Unified revision task",
      prompt: "Exercise the workflow #mock:needs_revision-once",
      allowMock: true,
      requiresApproval: false,
      sensitivity: "high"
    }
  });

  expect(created.json().status).toBe("needs_revision");

  const response = await app.inject({
    method: "POST",
    url: `/api/tasks/${created.json().id}/governance-actions/revise`,
    payload: {}
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    message: "Revision note must not be empty"
  });
});
```

- [ ] **Step 2: Run the route tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts --config vitest.config.ts
```

Expected:

```text
FAIL  apps/control-plane/src/routes/tasks.test.ts
+ expected 404 to be 200
```

- [ ] **Step 3: Implement the unified route and legacy wrappers**

```ts
import { TaskActionSchema, TaskSpecSchema, type TaskAction } from "@feudal/contracts";

const GovernanceActionParamsSchema = z.object({
  taskId: z.string(),
  actionType: TaskActionSchema
});

const GovernanceActionBodySchema = z.object({
  note: z.string().optional()
});

function parseGovernanceActionBody(
  actionType: TaskAction,
  input: unknown,
  reply: FastifyReply
) {
  const parsed = GovernanceActionBodySchema.safeParse(input ?? {});

  if (!parsed.success) {
    reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    return undefined;
  }

  const note = parsed.data.note?.trim();

  if (actionType === "revise" && !note) {
    reply.code(400).send({ message: "Revision note must not be empty" });
    return undefined;
  }

  return { note };
}

async function handleGovernanceAction(
  service: OrchestratorService,
  taskId: string,
  actionType: TaskAction,
  note: string | undefined,
  reply: FastifyReply
) {
  const task = await ensureTaskExists(service, taskId, reply);

  if (!task) {
    return reply;
  }

  return sendActionResult(reply, () =>
    service.submitGovernanceAction(taskId, actionType, note)
  );
}

app.post("/api/tasks/:taskId/governance-actions/:actionType", async (request, reply) => {
  const params = GovernanceActionParamsSchema.parse(request.params);
  const payload = parseGovernanceActionBody(params.actionType, request.body, reply);

  if (!payload) {
    return reply;
  }

  return handleGovernanceAction(
    service,
    params.taskId,
    params.actionType,
    payload.note,
    reply
  );
});

app.post("/api/tasks/:taskId/approve", async (request, reply) => {
  const params = TaskParamsSchema.parse(request.params);
  return handleGovernanceAction(service, params.taskId, "approve", undefined, reply);
});

app.post("/api/tasks/:taskId/reject", async (request, reply) => {
  const params = TaskParamsSchema.parse(request.params);
  return handleGovernanceAction(service, params.taskId, "reject", undefined, reply);
});

app.post("/api/tasks/:taskId/revise", async (request, reply) => {
  const params = TaskParamsSchema.parse(request.params);
  const payload = RevisionInputSchema.parse(request.body);
  return handleGovernanceAction(service, params.taskId, "revise", payload.note, reply);
});
```

- [ ] **Step 4: Re-run the route tests and verify they pass**

Run:

```bash
pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts --config vitest.config.ts
```

Expected:

```text
PASS  apps/control-plane/src/routes/tasks.test.ts
```

- [ ] **Step 5: Commit the unified route**

```bash
git add apps/control-plane/src/routes/tasks.ts apps/control-plane/src/routes/tasks.test.ts
git commit -m "feat: add unified governance action routes"
```

## Task 3: Add A Unified Governance Action API Client

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`
- Test: `apps/web/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing API client tests**

```ts
import type { TaskAction } from "@feudal/contracts";
import {
  approveTask,
  rejectTask,
  reviseTask,
  submitGovernanceAction
} from "./api";

describe("submitGovernanceAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts approve, reject, and revise through the unified governance route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "task-1", status: "awaiting_approval" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    await approveTask("task-1");
    await rejectTask("task-1");
    await reviseTask("task-1", "Tighten rollback scope.");
    await submitGovernanceAction("task-1", "approve");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/task-1/governance-actions/approve",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tasks/task-1/governance-actions/reject",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/tasks/task-1/governance-actions/revise",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Tighten rollback scope." })
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/tasks/task-1/governance-actions/approve",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }
    );
  });
});
```

- [ ] **Step 2: Run the API client tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/web/src/lib/api.test.ts --config vitest.config.ts
```

Expected:

```text
FAIL  apps/web/src/lib/api.test.ts
+ No export named 'submitGovernanceAction'
+ expected '/api/tasks/task-1/approve' to equal '/api/tasks/task-1/governance-actions/approve'
```

- [ ] **Step 3: Implement the unified API helper**

```ts
import type {
  OperatorActionRecord,
  OperatorActionSummary,
  TaskAction,
  TaskRecord
} from "@feudal/contracts";

export async function submitGovernanceAction(
  taskId: string,
  actionType: TaskAction,
  note?: string
) {
  return requestJson<TaskConsoleRecord>(
    `/api/tasks/${taskId}/governance-actions/${actionType}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(note ? { note } : {})
    }
  );
}

export async function approveTask(taskId: string) {
  return submitGovernanceAction(taskId, "approve");
}

export async function rejectTask(taskId: string) {
  return submitGovernanceAction(taskId, "reject");
}

export async function reviseTask(taskId: string, note: string) {
  return submitGovernanceAction(taskId, "revise", note);
}
```

- [ ] **Step 4: Re-run the API client tests and verify they pass**

Run:

```bash
pnpm exec vitest run apps/web/src/lib/api.test.ts --config vitest.config.ts
```

Expected:

```text
PASS  apps/web/src/lib/api.test.ts
```

- [ ] **Step 5: Commit the unified API client**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "feat: add unified governance action api client"
```

## Task 4: Render Dynamic Governance Actions In The Web Console

**Files:**
- Modify: `apps/web/src/components/approval-inbox-panel.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Test: `apps/web/src/app.test.tsx`

- [ ] **Step 1: Write the failing React tests**

```ts
it("submits approval through the unified governance route", async () => {
  const fetchMock = mockConsoleApi();

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Approve Build dashboard" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/governance-actions/approve",
      expect.objectContaining({
        method: "POST"
      })
    )
  );
});

it("submits revision through the unified governance route", async () => {
  const fetchMock = mockConsoleApi({
    initialTasks: [
      {
        ...defaultTask,
        status: "needs_revision",
        approvalRunId: undefined,
        approvalRequest: undefined,
        governance: {
          ...defaultTask.governance!,
          reviewVerdict: "needs_revision",
          allowedActions: ["revise"],
          revisionCount: 0
        },
        revisionRequest: {
          note: "Tighten rollback scope before approval.",
          reviewerReasons: ["rollback plan missing"]
        }
      }
    ]
  });

  render(<App />);

  fireEvent.change(await screen.findByLabelText("Revision note"), {
    target: { value: "Added rollback constraints and acceptance criteria." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit revision" }));

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/governance-actions/revise",
      expect.objectContaining({
        method: "POST"
      })
    )
  );
});

it("shows a mismatch warning and disables inline approval actions when governance and approval actions drift", async () => {
  mockConsoleApi({
    initialTasks: [
      {
        ...defaultTask,
        governance: {
          ...defaultTask.governance!,
          allowedActions: ["approve"]
        },
        approvalRequest: {
          ...defaultTask.approvalRequest!,
          actions: ["reject"]
        }
      }
    ]
  });

  render(<App />);

  expect(
    await screen.findByText("Governance action state is out of sync.")
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Approve Build dashboard" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Reject Build dashboard" })
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the React tests and confirm they fail**

Run:

```bash
pnpm exec vitest run apps/web/src/app.test.tsx --config vitest.config.ts
```

Expected:

```text
FAIL  apps/web/src/app.test.tsx
+ expected fetch to be called with /api/tasks/task-1/governance-actions/approve
+ Unable to find an element with the text: Governance action state is out of sync.
```

- [ ] **Step 3: Implement dynamic governance actions in the inbox and app**

```ts
import type { TaskAction, TaskRecord } from "@feudal/contracts";

interface ApprovalInboxPanelProps {
  activeTaskId?: string;
  onAction: (taskId: string, action: TaskAction) => void | Promise<void>;
  tasks: TaskRecord[];
}

function inlineGovernanceActions(task: TaskRecord): TaskAction[] {
  return (task.governance?.allowedActions ?? []).filter(
    (action): action is TaskAction => action !== "revise"
  );
}

function hasApprovalActionMismatch(task: TaskRecord) {
  if (task.status !== "awaiting_approval" || !task.approvalRequest) {
    return false;
  }

  const governanceActions = [...inlineGovernanceActions(task)].sort();
  const approvalActions = [...task.approvalRequest.actions].sort();

  return (
    governanceActions.length !== approvalActions.length ||
    governanceActions.some((action, index) => action !== approvalActions[index])
  );
}

function actionLabel(action: TaskAction, title: string) {
  return action === "approve"
    ? `Approve ${title}`
    : action === "reject"
      ? `Reject ${title}`
      : `Revise ${title}`;
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeTaskId, onAction, tasks } = props;

  return (
    <section className="panel panel-approval">
      <div className="panel-header">
        <h2>Governance Inbox</h2>
        <span>{tasks.length} waiting</span>
      </div>

      <ul className="detail-list">
        {tasks.map((task) => {
          const hasMismatch = hasApprovalActionMismatch(task);
          const inlineActions = hasMismatch ? [] : inlineGovernanceActions(task);

          return (
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
                {hasMismatch ? (
                  <small>Governance action state is out of sync.</small>
                ) : null}
              </div>
              <div className="button-row">
                {inlineActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={activeTaskId === task.id}
                    onClick={() => void onAction(task.id, action)}
                  >
                    {activeTaskId === task.id
                      ? `Processing ${task.title}...`
                      : actionLabel(action, task.title)}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

```ts
import type {
  OperatorActionRecord,
  OperatorActionSummary,
  OperatorActionType,
  TaskAction,
  TaskRecord,
  TaskStatus
} from "@feudal/contracts";
import {
  abandonTask,
  createTask,
  fetchAgents,
  fetchOperatorSummary,
  fetchRecoverySummary,
  fetchTaskOperatorActions,
  fetchTaskDiffs,
  fetchTaskEvents,
  fetchTaskReplay,
  fetchTasks,
  recoverTask,
  submitGovernanceAction,
  takeoverTask,
  type CreateTaskInput,
  type RecoverySummary,
  type TaskConsoleRecord,
  type TaskDiffEntry,
  type TaskEventSummary
} from "./lib/api";

async function handleGovernanceAction(
  taskId: string,
  action: TaskAction,
  note?: string
) {
  setActiveGovernanceId(taskId);

  try {
    const nextTask = await submitGovernanceAction(taskId, action, note);

    startTransition(() => {
      upsertTask(nextTask);
      setSelectedTaskId(nextTask.id);
      if (action === "revise") {
        setRevisionDrafts((current) => ({ ...current, [taskId]: "" }));
      }
      setError(undefined);
    });
  } catch (nextError: unknown) {
    setError(
      nextError instanceof Error
        ? nextError.message
        : "Unable to execute the governance action."
    );
  } finally {
    setActiveGovernanceId(undefined);
  }
}

<ApprovalInboxPanel
  activeTaskId={activeGovernanceId}
  onAction={(taskId, action) => handleGovernanceAction(taskId, action)}
  tasks={governanceTasks}
/>

onSubmitRevision={() =>
  selectedTask
    ? handleGovernanceAction(
        selectedTask.id,
        "revise",
        revisionDrafts[selectedTask.id] ?? ""
      )
    : Promise.resolve()
}
```

```ts
const taskGovernanceActionMatch = url.match(
  /\/api\/tasks\/([^/]+)\/governance-actions\/(approve|reject|revise)$/
);

if (taskGovernanceActionMatch && method === "POST") {
  const taskId = taskGovernanceActionMatch[1]!;
  const action = taskGovernanceActionMatch[2]!;

  if (action === "approve") {
    const approvedTask =
      options?.approvedTask ??
      ({
        ...defaultTask,
        status: "completed",
        approvalRunId: undefined,
        approvalRequest: undefined,
        artifacts: [
          ...defaultTask.artifacts,
          {
            id: "artifact-2",
            kind: "execution-report",
            name: "execution-report.json",
            mimeType: "application/json",
            content: { output: "Verifier accepted the work." }
          }
        ],
        history: [
          ...defaultTask.history,
          {
            status: "completed",
            at: "2026-04-02T14:10:00.000Z",
            note: "verification.passed"
          }
        ],
        runs: [
          ...defaultTask.runs.map((run) =>
            run.phase === "planning" ? { ...run, status: "completed" } : run
          ),
          {
            id: "run-2",
            agent: "gongbu-executor",
            status: "completed",
            phase: "execution"
          },
          {
            id: "run-3",
            agent: "xingbu-verifier",
            status: "completed",
            phase: "verification"
          }
        ],
        updatedAt: "2026-04-02T14:10:00.000Z"
      } satisfies TaskRecord);

    tasks = tasks.map((task) => (task.id === approvedTask.id ? approvedTask : task));
    return json(approvedTask);
  }

  if (action === "reject") {
    const rejectedTask =
      options?.rejectedTask ??
      ({
        ...defaultTask,
        status: "rejected",
        approvalRunId: undefined,
        approvalRequest: undefined,
        history: [
          ...defaultTask.history,
          {
            status: "rejected",
            at: "2026-04-02T14:10:00.000Z",
            note: "approval.rejected"
          }
        ],
        updatedAt: "2026-04-02T14:10:00.000Z"
      } satisfies TaskRecord);

    tasks = tasks.map((task) => (task.id === rejectedTask.id ? rejectedTask : task));
    return json(rejectedTask);
  }

  const revisedTask =
    options?.revisedTask ??
    ({
      ...defaultTask,
      status: "awaiting_approval",
      approvalRunId: "await-2",
      approvalRequest: {
        runId: "await-2",
        prompt: "Approve the updated decision brief?",
        actions: ["approve", "reject"]
      },
      governance: {
        ...defaultTask.governance!,
        reviewVerdict: "approved",
        allowedActions: ["approve", "reject"],
        revisionCount: 1
      },
      updatedAt: "2026-04-02T14:20:00.000Z"
    } satisfies TaskRecord);

  tasks = tasks.map((task) => (task.id === taskId ? revisedTask : task));
  return json(revisedTask);
}
```

- [ ] **Step 4: Re-run the React tests and verify they pass**

Run:

```bash
pnpm exec vitest run apps/web/src/app.test.tsx --config vitest.config.ts
```

Expected:

```text
PASS  apps/web/src/app.test.tsx
```

- [ ] **Step 5: Commit the web governance UI migration**

```bash
git add apps/web/src/components/approval-inbox-panel.tsx apps/web/src/app.tsx apps/web/src/app.test.tsx
git commit -m "feat: render dynamic governance actions"
```

## Task 5: Add Browser Coverage And Run Full Verification

**Files:**
- Modify: `apps/web/e2e/task-flow.spec.ts`
- Test: `apps/web/e2e/task-flow.spec.ts`

- [ ] **Step 1: Write the failing browser assertion**

```ts
test("drives one governance revision loop through approval and completion", async ({
  page
}) => {
  const governanceRequests: string[] = [];
  const title = "Governance revision drill";
  const prompt = "Exercise governance #mock:needs_revision-once";

  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/tasks/") &&
      request.url().includes("/governance-actions/")
    ) {
      governanceRequests.push(request.url());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Prompt").fill(prompt);
  await page.getByLabel("Sensitivity").selectOption("high");
  await page.getByRole("checkbox", { name: "Require approval gate" }).uncheck();
  await page.getByRole("checkbox", { name: "Allow mock fallback" }).check();
  await page.getByRole("button", { name: "Submit task" }).click();

  await expect(page.getByRole("heading", { name: "Governance Inbox" })).toBeVisible();
  await expect(page.locator(".panel-detail .panel-header span")).toHaveText("Needs Revision");

  await page
    .getByLabel("Revision note")
    .fill("Revision note: tighten rollback scope and add acceptance criteria.");
  await page.getByRole("button", { name: "Submit revision" }).click();

  const approveButton = page.getByRole("button", { name: `Approve ${title}` });
  await expect(approveButton).toBeVisible();
  await approveButton.click();

  await expect(page.getByText("Verifier accepted the execution report.")).toBeVisible();
  await expect(governanceRequests).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/\/governance-actions\/revise$/),
      expect.stringMatching(/\/governance-actions\/approve$/)
    ])
  );
});
```

- [ ] **Step 2: Run the Playwright spec and confirm it fails before the web changes**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter @feudal/web exec playwright test apps/web/e2e/task-flow.spec.ts
```

Expected:

```text
1 failed
+ Expected governanceRequests to contain /governance-actions/revise and /governance-actions/approve
```

- [ ] **Step 3: Re-run the browser spec until it passes**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter @feudal/web exec playwright test apps/web/e2e/task-flow.spec.ts
```

Expected:

```text
1 passed
```

- [ ] **Step 4: Run the full verification commands**

Run:

```bash
pnpm test
pnpm build
COREPACK_HOME=/tmp/corepack corepack pnpm --filter @feudal/web exec playwright test
```

Expected:

```text
PASS  all Vitest suites in vitest.config.ts
vite v7 build completed successfully for @feudal/web
PASS  all Playwright specs
```

- [ ] **Step 5: Commit the browser coverage and final migration**

```bash
git add apps/web/e2e/task-flow.spec.ts
git commit -m "test: verify unified governance browser flow"
```

## Spec Coverage Check

- Unified control-plane governance command route is implemented in Task 1 and Task 2 through the new dispatcher and `/governance-actions/:actionType` route.
- Legacy route compatibility is preserved in Task 2 by keeping `/approve`, `/reject`, and `/revise` as wrappers.
- Dynamic inbox rendering from `task.governance.allowedActions` is implemented in Task 4.
- Unified `revise` submission with required notes is implemented in Task 1, Task 2, Task 3, and Task 4.
- Governance and approval action drift handling is covered in Task 1 and Task 4 through backend rejection and frontend mismatch degradation.
- Browser verification of the revision loop on unified routes is covered in Task 5.
