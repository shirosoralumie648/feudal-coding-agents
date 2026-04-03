import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ACPAgentManifest } from "@feudal/acp";
import type { TaskRecord } from "@feudal/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const defaultAgents: ACPAgentManifest[] = [
  {
    name: "gongbu-executor",
    role: "工部",
    description: "Executes approved assignments.",
    capabilities: ["assignment", "execution-report"]
  }
];

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
  createdAt: "2026-04-02T14:00:00.000Z",
  updatedAt: "2026-04-02T14:00:00.000Z"
};

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" }
    })
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function mockConsoleApi(options?: {
  agents?: ACPAgentManifest[];
  initialTasks?: TaskRecord[];
  createdTask?: TaskRecord;
  approvedTask?: TaskRecord;
  rejectedTask?: TaskRecord;
  recoverySummary?: {
    tasksNeedingRecovery: number;
    runsNeedingRecovery: number;
  };
  events?: Array<{ id: number; eventType: string; occurredAt: string }>;
  diffs?: Array<{
    id: number;
    changedPaths: string[];
    afterSubsetJson: Record<string, unknown>;
  }>;
  replay?: { task: Pick<TaskRecord, "id" | "title" | "status"> };
  tasksResponse?: Promise<Response>;
}) {
  const agents = options?.agents ?? defaultAgents;
  let tasks = options?.initialTasks ?? [defaultTask];

  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const taskEventMatch = url.match(/\/api\/tasks\/([^/]+)\/events$/);
    const taskDiffMatch = url.match(/\/api\/tasks\/([^/]+)\/diffs$/);
    const taskReplayMatch = url.match(/\/api\/tasks\/([^/]+)\/replay/);

    if (url.endsWith("/api/tasks") && method === "GET") {
      return options?.tasksResponse ?? json(tasks);
    }

    if (url.endsWith("/api/agents") && method === "GET") {
      return json(agents);
    }

    if (url.endsWith("/api/recovery/summary") && method === "GET") {
      return json(
        options?.recoverySummary ?? {
          tasksNeedingRecovery: 0,
          runsNeedingRecovery: 0
        }
      );
    }

    if (taskEventMatch && method === "GET") {
      return json(options?.events ?? []);
    }

    if (taskDiffMatch && method === "GET") {
      return json(options?.diffs ?? []);
    }

    if (taskReplayMatch && method === "GET") {
      const replayTaskId = taskReplayMatch[1];
      const replayTask = tasks.find((task) => task.id === replayTaskId) ?? defaultTask;
      return json(options?.replay ?? { task: replayTask });
    }

    if (url.endsWith("/api/tasks") && method === "POST") {
      const createdTask = options?.createdTask ?? defaultTask;
      tasks = [createdTask, ...tasks];
      return json(createdTask, 201);
    }

    if (url.endsWith(`/api/tasks/${defaultTask.id}/approve`) && method === "POST") {
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

    if (url.endsWith(`/api/tasks/${defaultTask.id}/reject`) && method === "POST") {
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
              at: "2026-04-02T14:05:00.000Z",
              note: "approval.rejected"
            }
          ],
          updatedAt: "2026-04-02T14:05:00.000Z"
        } satisfies TaskRecord);

      tasks = tasks.map((task) => (task.id === rejectedTask.id ? rejectedTask : task));
      return json(rejectedTask);
    }

    throw new Error(`Unexpected fetch for ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the phase 1 control console sections from API data", async () => {
    mockConsoleApi();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "New Task" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Task Detail" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Approval Inbox" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Agent Registry" })).toBeVisible();

    expect(
      await screen.findByRole("heading", { level: 3, name: "Build dashboard" })
    ).toBeVisible();
    expect(screen.getByText("gongbu-executor")).toBeVisible();
    expect(screen.getByText("Review and execute the dashboard task.")).toBeVisible();
  });

  it("shows ACP run details and approval prompt from the selected task", async () => {
    mockConsoleApi();

    render(<App />);

    expect(await screen.findByText("Run run-1")).toBeVisible();
    expect(screen.getByText("Approve the decision brief?")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve Build dashboard" })
    ).toBeVisible();
  });

  it("approves a task from the inbox and refreshes the detail panel", async () => {
    const fetchMock = mockConsoleApi();

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve Build dashboard" }));

    expect(
      await screen.findByRole("heading", { level: 3, name: "Build dashboard" })
    ).toBeVisible();
    expect(await screen.findByText("Verifier accepted the work.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/approve",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects a task from the inbox and refreshes the detail panel", async () => {
    const fetchMock = mockConsoleApi();

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject Build dashboard" }));

    expect(
      await screen.findByRole("heading", { level: 3, name: "Build dashboard" })
    ).toBeVisible();
    expect(await screen.findByText("approval.rejected")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/reject",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("submits a new task and refreshes the control plane", async () => {
    const createdTask: TaskRecord = {
      ...defaultTask,
      id: "task-2",
      title: "Refine ACP registry",
      prompt: "Add registry filters and health summaries.",
      runIds: ["run-2"],
      approvalRunId: "await-2"
    };

    const fetchMock = mockConsoleApi({ initialTasks: [], createdTask });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: createdTask.title }
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: createdTask.prompt }
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit task" })).toBeEnabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit task" }));

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Refine ACP registry"
      })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("preserves a created task when the initial task load resolves late", async () => {
    const initialTasks = deferred<Response>();
    const createdTask: TaskRecord = {
      ...defaultTask,
      id: "task-2",
      title: "Stabilize replay recovery",
      prompt: "Verify restart recovery and replay reporting in the console.",
      runIds: ["run-2"],
      approvalRunId: "await-2",
      approvalRequest: {
        runId: "await-2",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      }
    };

    mockConsoleApi({
      initialTasks: [],
      createdTask,
      tasksResponse: initialTasks.promise
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: createdTask.title }
    });
    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: createdTask.prompt }
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit task" })).toBeEnabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit task" }));

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: createdTask.title
      })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Approve ${createdTask.title}` })
    ).toBeVisible();

    await act(async () => {
      initialTasks.resolve(await json([]));
    });

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: createdTask.title
      })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Approve ${createdTask.title}` })
    ).toBeVisible();
  });

  it("shows recovery badges, timeline events, and diff details for the selected task", async () => {
    mockConsoleApi({
      recoverySummary: { tasksNeedingRecovery: 1, runsNeedingRecovery: 1 },
      events: [
        {
          id: 7,
          eventType: "task.approval_requested",
          occurredAt: "2026-04-03T10:00:00.000Z"
        }
      ],
      diffs: [
        {
          id: 8,
          changedPaths: ["/approvalRequest/prompt"],
          afterSubsetJson: { prompt: "Approve the decision brief?" }
        }
      ],
      replay: {
        task: {
          id: "task-1",
          title: "Build dashboard",
          status: "awaiting_approval"
        }
      }
    });

    render(<App />);

    expect(screen.getByText("Recovery Clear")).toBeVisible();
    expect(await screen.findByText("Recovery Required")).toBeVisible();
    expect(screen.getByText("task.approval_requested")).toBeVisible();
    expect(screen.getByText("/approvalRequest/prompt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Replay Build dashboard" })).toBeVisible();
  });
});
