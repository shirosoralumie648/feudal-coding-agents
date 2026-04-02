import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function mockConsoleApi(options?: {
  agents?: ACPAgentManifest[];
  initialTasks?: TaskRecord[];
  createdTask?: TaskRecord;
  approvedTask?: TaskRecord;
}) {
  const agents = options?.agents ?? defaultAgents;
  let tasks = options?.initialTasks ?? [defaultTask];

  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/tasks") && method === "GET") {
      return json(tasks);
    }

    if (url.endsWith("/api/agents") && method === "GET") {
      return json(agents);
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
          updatedAt: "2026-04-02T14:10:00.000Z"
        } satisfies TaskRecord);

      tasks = tasks.map((task) => (task.id === approvedTask.id ? approvedTask : task));
      return json(approvedTask);
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
});
