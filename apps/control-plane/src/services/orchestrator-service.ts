import type { ACPClient, ACPRun } from "@feudal/acp";
import type {
  ACPRunSummary,
  TaskArtifact,
  TaskRecord,
  TaskSpec
} from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import { MemoryTaskStore, type TaskStore } from "../store";

export interface OrchestratorService {
  createTask(spec: TaskSpec): Promise<TaskProjectionRecord>;
  approveTask(taskId: string): Promise<TaskProjectionRecord>;
  rejectTask(taskId: string): Promise<TaskProjectionRecord>;
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  listTaskEvents(taskId: string): ReturnType<TaskStore["listTaskEvents"]>;
  listTaskDiffs(taskId: string): ReturnType<TaskStore["listTaskDiffs"]>;
  listTaskRuns(taskId: string): ReturnType<TaskStore["listTaskRuns"]>;
  listTaskArtifacts(taskId: string): ReturnType<TaskStore["listTaskArtifacts"]>;
  replayTaskAtEventId(
    taskId: string,
    eventId: number
  ): ReturnType<TaskStore["replayTaskAtEventId"]>;
  getRecoverySummary(): ReturnType<TaskStore["getRecoverySummary"]>;
  rebuildProjectionsIfNeeded(): ReturnType<TaskStore["rebuildProjectionsIfNeeded"]>;
  listAgents(): ReturnType<ACPClient["listAgents"]>;
}

function toTaskArtifact(
  runId: string,
  kind: TaskArtifact["kind"],
  content: unknown
): TaskArtifact {
  return {
    id: runId,
    kind,
    name: `${kind}.json`,
    mimeType: "application/json",
    content
  };
}

function toRunSummary(
  run: ACPRun,
  phase: ACPRunSummary["phase"]
): ACPRunSummary {
  return {
    id: run.id,
    agent: run.agent,
    status: run.status,
    phase,
    awaitPrompt: run.awaitPrompt,
    allowedActions: run.allowedActions
  };
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
    createdAt: now,
    updatedAt: now,
    recoveryState: "healthy",
    latestEventId: 0,
    latestProjectionVersion: 0
  };
}

export function createOrchestratorService(options: {
  acpClient: ACPClient;
  store?: TaskStore;
}): OrchestratorService {
  const acp = options.acpClient;
  const store = options.store ?? new MemoryTaskStore();

  return {
    async createTask(spec: TaskSpec): Promise<TaskProjectionRecord> {
      let task = transitionTask(newTask(spec), { type: "task.submitted" });
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

      const intakeRun = await acp.runAgent({
        agent: "intake-agent",
        messages: [{ role: "user", content: spec.prompt }]
      });
      task = transitionTask(task, { type: "intake.completed" });
      await persistTask(task, "task.intake_completed");

      const analystRun = await acp.runAgent({
        agent: "analyst-agent",
        messages: [
          {
            role: "agent/intake-agent",
            content: JSON.stringify(intakeRun.artifacts[0]?.content)
          }
        ]
      });
      task = transitionTask(task, { type: "planning.completed" });
      await persistTask(task, "task.planning_completed");

      const [auditorRun, criticRun] = await Promise.all([
        acp.runAgent({
          agent: "auditor-agent",
          messages: [
            {
              role: "agent/analyst-agent",
              content: JSON.stringify(analystRun.artifacts[0]?.content)
            }
          ]
        }),
        acp.runAgent({
          agent: "critic-agent",
          messages: [
            {
              role: "agent/analyst-agent",
              content: JSON.stringify(analystRun.artifacts[0]?.content)
            }
          ]
        })
      ]);

      task = transitionTask(task, { type: "review.approved" });
      await persistTask(task, "task.review_approved");

      const approvalRun = await acp.awaitExternalInput({
        label: "approval-gate",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      });

      task = {
        ...task,
        artifacts: [
          toTaskArtifact(intakeRun.id, "taskspec", intakeRun.artifacts[0]?.content),
          toTaskArtifact(
            analystRun.id,
            "decision-brief",
            analystRun.artifacts[0]?.content
          ),
          toTaskArtifact(
            auditorRun.id,
            "review",
            auditorRun.artifacts[0]?.content
          ),
          toTaskArtifact(
            criticRun.id,
            "review",
            criticRun.artifacts[0]?.content
          )
        ],
        runIds: [
          intakeRun.id,
          analystRun.id,
          auditorRun.id,
          criticRun.id,
          approvalRun.id
        ],
        runs: [
          toRunSummary(intakeRun, "intake"),
          toRunSummary(analystRun, "planning"),
          toRunSummary(auditorRun, "review"),
          toRunSummary(criticRun, "review"),
          toRunSummary(approvalRun, "approval")
        ],
        approvalRunId: approvalRun.id,
        approvalRequest: {
          runId: approvalRun.id,
          prompt: approvalRun.awaitPrompt ?? "Approve the decision brief?",
          actions: approvalRun.allowedActions ?? ["approve", "reject"]
        }
      };

      return persistTask(task, "task.awaiting_approval");
    },

    async approveTask(taskId: string): Promise<TaskProjectionRecord> {
      const current = await store.getTask(taskId);

      if (!current || !current.approvalRunId) {
        throw new Error(`Task ${taskId} is not awaiting approval`);
      }
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

      const resumedApprovalRun = await acp.respondToAwait(current.approvalRunId, {
        role: "user",
        content: "approve"
      });

      let task = transitionTask(current, { type: "approval.granted" });
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined,
        runs: task.runs.map((run) =>
          run.id === resumedApprovalRun.id ? toRunSummary(resumedApprovalRun, "approval") : run
        )
      };
      await persistTask(task, "task.approved");

      const executorInput = {
        agent: "gongbu-executor",
        messages: [{ role: "user", content: current.prompt }] as ACPRun["messages"]
      };

      let executorRun: ACPRun;

      try {
        try {
          executorRun = await acp.runAgent(executorInput);
        } catch {
          executorRun = await acp.runAgent(executorInput);
        }
      } catch {
        const failedTask = transitionTask(
          transitionTask(task, { type: "dispatch.completed" }),
          { type: "execution.failed" }
        );
        return persistTask(failedTask, "task.execution_failed");
      }

      task = transitionTask(task, { type: "dispatch.completed" });
      task = transitionTask(task, { type: "execution.completed" });

      const verifierRun = await acp.runAgent({
        agent: "xingbu-verifier",
        messages: [
          {
            role: "agent/gongbu-executor",
            content: JSON.stringify(executorRun.artifacts[0]?.content)
          }
        ]
      });

      const verifierArtifact = (verifierRun.artifacts[0]?.content ?? {}) as {
        result?: string;
        blockingIssues?: string[];
      };

      task =
        verifierArtifact.blockingIssues && verifierArtifact.blockingIssues.length > 0
          ? transitionTask(task, { type: "verification.failed" })
          : verifierArtifact.result === "verified"
            ? transitionTask(task, { type: "verification.passed" })
            : transitionTask(task, { type: "verification.partial" });

      task = {
        ...task,
        artifacts: [
          ...task.artifacts,
          toTaskArtifact(
            executorRun.id,
            "execution-report",
            executorRun.artifacts[0]?.content
          ),
          toTaskArtifact(
            verifierRun.id,
            "execution-report",
            verifierRun.artifacts[0]?.content
          )
        ],
        runIds: [...task.runIds, executorRun.id, verifierRun.id],
        runs: [
          ...task.runs,
          toRunSummary(executorRun, "execution"),
          toRunSummary(verifierRun, "verification")
        ]
      };

      return persistTask(task, `task.${task.status}`);
    },

    async rejectTask(taskId: string): Promise<TaskProjectionRecord> {
      const current = await store.getTask(taskId);

      if (!current || !current.approvalRunId) {
        throw new Error(`Task ${taskId} is not awaiting approval`);
      }

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

      const resumedApprovalRun = await acp.respondToAwait(current.approvalRunId, {
        role: "user",
        content: "reject"
      });

      const rejectedTask = {
        ...transitionTask(current, { type: "approval.rejected" }),
        approvalRunId: undefined,
        approvalRequest: undefined,
        runs: current.runs.map((run) =>
          run.id === resumedApprovalRun.id ? toRunSummary(resumedApprovalRun, "approval") : run
        )
      };

      return persistTask(rejectedTask, "task.rejected");
    },

    async listTasks() {
      return store.listTasks();
    },

    async getTask(taskId: string) {
      return store.getTask(taskId);
    },

    async listTaskEvents(taskId: string) {
      return store.listTaskEvents(taskId);
    },

    async listTaskDiffs(taskId: string) {
      return store.listTaskDiffs(taskId);
    },

    async listTaskRuns(taskId: string) {
      return store.listTaskRuns(taskId);
    },

    async listTaskArtifacts(taskId: string) {
      return store.listTaskArtifacts(taskId);
    },

    async replayTaskAtEventId(taskId: string, eventId: number) {
      return store.replayTaskAtEventId(taskId, eventId);
    },

    async getRecoverySummary() {
      return store.getRecoverySummary();
    },

    async rebuildProjectionsIfNeeded() {
      await store.rebuildProjectionsIfNeeded();
    },

    async listAgents() {
      return acp.listAgents();
    }
  };
}
