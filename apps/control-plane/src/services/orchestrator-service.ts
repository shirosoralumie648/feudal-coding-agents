import type { ACPClient, ACPMessage, ACPRun } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import type {
  ACPRunSummary,
  GovernanceExecutionMode,
  OperatorActionType,
  RecoveryState,
  TaskAction,
  TaskArtifact,
  TaskGovernance,
  TaskRecord,
  TaskSpec
} from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import {
  aggregateReviewVerdict,
  allowedActionsForStatus,
  createTaskGovernance,
  syncGovernance
} from "../governance/policy";
import {
  assertOperatorActionAllowed,
  syncOperatorActions
} from "../operator-actions/policy";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import { MemoryTaskStore, type TaskStore } from "../store";
import { createTaskRunGateway, type TaskRunGateway } from "./task-run-gateway";

const APPROVAL_PROMPT = "Approve the decision brief?";
const MOCK_FALLBACK_REASON = "mock fallback used after real ACP failure";
const REVISION_LIMIT_REASON = "revision limit reached";

export class ActionNotAllowedError extends Error {
  constructor(taskId: string, action: TaskAction) {
    super(`Task ${taskId} does not allow ${action}`);
    this.name = "ActionNotAllowedError";
  }
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
  recoverTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  takeoverTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  abandonTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  listOperatorActions(taskId: string): ReturnType<TaskStore["listOperatorActions"]>;
  getOperatorActionSummary(): ReturnType<TaskStore["getOperatorActionSummary"]>;
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

type PersistTask = (
  taskSnapshot: TaskRecord,
  eventType: string
) => Promise<TaskProjectionRecord>;

interface StepResult {
  task: TaskRecord;
  run: ACPRun;
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
    operatorAllowedActions: [],
    governance: createTaskGovernance(spec),
    createdAt: now,
    updatedAt: now,
    recoveryState: "healthy",
    latestEventId: 0,
    latestProjectionVersion: 0
  };
}

function ensureGovernance(task: TaskRecord): TaskGovernance {
  if (task.governance) {
    return task.governance;
  }

  return createTaskGovernance({
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    allowMock: false,
    requiresApproval: task.status === "awaiting_approval",
    sensitivity: "medium"
  });
}

function currentExecutionMode(task: TaskRecord): GovernanceExecutionMode {
  return ensureGovernance(task).executionMode;
}

function mergePolicyReasons(existing: string[], additions: string[]): string[] {
  const merged = [...existing];

  for (const reason of additions) {
    if (!merged.includes(reason)) {
      merged.push(reason);
    }
  }

  return merged;
}

function applyExecutionMode(
  task: TaskRecord,
  executionMode: GovernanceExecutionMode
): TaskRecord {
  const governance = ensureGovernance(task);
  const switchedToFallback =
    governance.executionMode !== "mock_fallback_used" &&
    executionMode === "mock_fallback_used";
  const policyReasons = switchedToFallback
    ? mergePolicyReasons(governance.policyReasons, [MOCK_FALLBACK_REASON])
    : governance.policyReasons;

  return {
    ...task,
    governance: {
      ...governance,
      executionMode,
      policyReasons
    }
  };
}

function allowedActions(task: TaskRecord): TaskAction[] {
  if (task.governance) {
    return task.governance.allowedActions;
  }

  return allowedActionsForStatus(task.status);
}

function assertActionAllowed(task: TaskRecord, action: TaskAction) {
  const taskWithGovernance = syncGovernance(task);

  if (!allowedActions(taskWithGovernance).includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }
}

function assertApprovalActionAllowed(task: TaskRecord, action: TaskAction) {
  if (task.status !== "awaiting_approval" || action === "revise") {
    return;
  }

  const approvalActions = task.approvalRequest?.actions ?? [];

  if (!approvalActions.includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }
}

function appendRun(task: TaskRecord, run: ACPRun, phase: ACPRunSummary["phase"]) {
  return {
    ...task,
    runIds: [...task.runIds, run.id],
    runs: [...task.runs, toRunSummary(run, phase)]
  };
}

function appendArtifact(
  task: TaskRecord,
  runId: string,
  kind: TaskArtifact["kind"],
  content: unknown
) {
  return {
    ...task,
    artifacts: [...task.artifacts, toTaskArtifact(runId, kind, content)]
  };
}

function updateExistingRunSummary(
  task: TaskRecord,
  run: ACPRun,
  phase: ACPRunSummary["phase"]
) {
  return {
    ...task,
    runs: task.runs.map((item) =>
      item.id === run.id ? toRunSummary(run, phase) : item
    )
  };
}

function revisionNoteMessage(note: string): ACPMessage {
  return {
    role: "user",
    content: `Revision note: ${note}`
  };
}

function createPersistTask(options: {
  store: TaskStore;
  initialVersion: number;
}) {
  let latestProjectionVersion = options.initialVersion;

  const persistTask: PersistTask = async (taskSnapshot, eventType) => {
    const syncedSnapshot = syncOperatorActions(
      syncGovernance(taskSnapshot),
      currentRecoveryState(taskSnapshot)
    );
    const projection = await options.store.saveTask(
      syncedSnapshot,
      eventType,
      latestProjectionVersion
    );
    latestProjectionVersion = projection.latestProjectionVersion;
    return projection;
  };

  return persistTask;
}

function currentRecoveryState(task: TaskRecord): RecoveryState {
  return (task as TaskRecord & { recoveryState?: RecoveryState }).recoveryState ?? "healthy";
}

function withRecoveryState(task: TaskRecord, recoveryState: RecoveryState): TaskRecord {
  const projectionTask = task as TaskRecord & { recoveryReason?: string };

  return {
    ...task,
    recoveryState,
    recoveryReason:
      recoveryState === "healthy" ? undefined : projectionTask.recoveryReason
  } as TaskRecord;
}

function replaceLatestHistoryNote(task: TaskRecord, note: string): TaskRecord {
  if (task.history.length === 0) {
    return task;
  }

  const history = [...task.history];
  history[history.length - 1] = {
    ...history[history.length - 1]!,
    note
  };

  return { ...task, history };
}

const OPERATOR_NOTE_ERROR = "Operator note must not be empty";

function normalizeOperatorNote(note: string) {
  const trimmed = note.trim();

  if (trimmed.length === 0) {
    throw new Error(OPERATOR_NOTE_ERROR);
  }

  return trimmed;
}

function createRevisionLimitRejection(task: TaskRecord): TaskRecord {
  const governance = ensureGovernance(task);

  return {
    ...task,
    governance: {
      ...governance,
      reviewVerdict: "rejected",
      policyReasons: mergePolicyReasons(governance.policyReasons, [REVISION_LIMIT_REASON])
    },
    revisionRequest: {
      note: REVISION_LIMIT_REASON,
      reviewerReasons: [REVISION_LIMIT_REASON],
      createdAt: new Date().toISOString()
    }
  };
}

export function createOrchestratorService(options: {
  runGateway?: TaskRunGateway;
  acpClient?: ACPClient;
  store?: TaskStore;
}): OrchestratorService {
  const runGateway =
    options.runGateway ??
    (options.acpClient
      ? createTaskRunGateway({
          realClient: options.acpClient,
          mockClient: createMockACPClient()
        })
      : undefined);

  if (!runGateway) {
    throw new Error("Either runGateway or acpClient must be provided");
  }

  const store = options.store ?? new MemoryTaskStore();

  async function recordRequestedThenValidate(
    current: TaskProjectionRecord,
    actionType: OperatorActionType,
    note: string
  ) {
    await store.recordOperatorAction({
      taskId: current.id,
      actionType,
      status: "requested",
      note,
      payloadJson: {
        fromStatus: current.status,
        recoveryState: current.recoveryState
      }
    });

    try {
      assertOperatorActionAllowed(
        syncOperatorActions(current, current.recoveryState),
        actionType
      );
    } catch (error) {
      await store.recordOperatorAction({
        taskId: current.id,
        actionType,
        status: "rejected",
        note,
        rejectedAt: new Date().toISOString(),
        rejectionReason: error instanceof Error ? error.message : "Operator action rejected"
      });
      throw error;
    }
  }

  async function runStep(
    task: TaskRecord,
    phase: ACPRunSummary["phase"],
    input: {
      agent: string;
      messages: ACPMessage[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<StepResult> {
    const result = await runGateway.runAgent(
      { executionMode: currentExecutionMode(task) },
      input
    );

    return {
      task: applyExecutionMode(task, result.executionMode),
      run: result.value
    };
  }

  async function awaitStep(
    task: TaskRecord,
    input: {
      label: string;
      prompt: string;
      actions: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<StepResult> {
    const result = await runGateway.awaitExternalInput(
      { executionMode: currentExecutionMode(task) },
      input
    );

    return {
      task: applyExecutionMode(task, result.executionMode),
      run: result.value
    };
  }

  async function runExecutionAndVerification(options: {
    task: TaskRecord;
    persistTask: PersistTask;
    runMetadata: Record<string, unknown>;
  }) {
    let task = transitionTask(options.task, { type: "dispatch.completed" });
    let executorRun: ACPRun;

    try {
      const executionInput = {
        agent: "gongbu-executor",
        messages: [{ role: "user", content: task.prompt }],
        metadata: options.runMetadata
      } satisfies {
        agent: string;
        messages: ACPMessage[];
        metadata?: Record<string, unknown>;
      };

      let executeStep: StepResult;

      try {
        executeStep = await runStep(task, "execution", executionInput);
      } catch {
        executeStep = await runStep(task, "execution", executionInput);
      }

      task = executeStep.task;
      executorRun = executeStep.run;
    } catch {
      const failedTask = transitionTask(task, { type: "execution.failed" });
      return options.persistTask(failedTask, "task.execution_failed");
    }

    task = transitionTask(task, { type: "execution.completed" });

    const verifyStep = await runStep(task, "verification", {
      agent: "xingbu-verifier",
      messages: [
        {
          role: "agent/gongbu-executor",
          content: JSON.stringify(executorRun.artifacts[0]?.content)
        }
      ],
      metadata: options.runMetadata
    });

    task = verifyStep.task;
    const verifierRun = verifyStep.run;
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

    task = appendArtifact(
      appendArtifact(task, executorRun.id, "execution-report", executorRun.artifacts[0]?.content),
      verifierRun.id,
      "execution-report",
      verifierRun.artifacts[0]?.content
    );
    task = appendRun(appendRun(task, executorRun, "execution"), verifierRun, "verification");

    return options.persistTask(task, `task.${task.status}`);
  }

  async function runPlanningReviewAndBranch(options: {
    task: TaskRecord;
    persistTask: PersistTask;
    runMetadata: Record<string, unknown>;
    revisionNote?: string;
  }) {
    let task = options.task;
    const revisionNote = options.revisionNote?.trim();
    const taskspecArtifact = task.artifacts.find((artifact) => artifact.kind === "taskspec");

    const planningMessages: ACPMessage[] = [
      {
        role: "agent/intake-agent",
        content: JSON.stringify(taskspecArtifact?.content)
      }
    ];

    if (revisionNote) {
      planningMessages.push(revisionNoteMessage(revisionNote));
    }

    const planningStep = await runStep(task, "planning", {
      agent: "analyst-agent",
      messages: planningMessages,
      metadata: options.runMetadata
    });
    task = planningStep.task;
    const analystRun = planningStep.run;

    task = transitionTask(task, { type: "planning.completed" });
    task = appendArtifact(task, analystRun.id, "decision-brief", analystRun.artifacts[0]?.content);
    task = appendRun(task, analystRun, "planning");
    await options.persistTask(task, "task.planning_completed");

    const reviewMessages: ACPMessage[] = [
      {
        role: "agent/analyst-agent",
        content: JSON.stringify(analystRun.artifacts[0]?.content)
      },
      {
        role: "user",
        content: task.prompt
      }
    ];

    if (revisionNote) {
      reviewMessages.push(revisionNoteMessage(revisionNote));
    }

    const auditorStep = await runStep(task, "review", {
      agent: "auditor-agent",
      messages: reviewMessages,
      metadata: options.runMetadata
    });
    task = appendArtifact(
      auditorStep.task,
      auditorStep.run.id,
      "review",
      auditorStep.run.artifacts[0]?.content
    );
    task = appendRun(task, auditorStep.run, "review");

    const criticStep = await runStep(task, "review", {
      agent: "critic-agent",
      messages: reviewMessages,
      metadata: options.runMetadata
    });
    task = appendArtifact(
      criticStep.task,
      criticStep.run.id,
      "review",
      criticStep.run.artifacts[0]?.content
    );
    task = appendRun(task, criticStep.run, "review");

    const aggregatedReview = aggregateReviewVerdict([
      auditorStep.run.artifacts[0]?.content as Record<string, unknown>,
      criticStep.run.artifacts[0]?.content as Record<string, unknown>
    ]);
    const governance = ensureGovernance(task);
    task = {
      ...task,
      governance: {
        ...governance,
        reviewVerdict: aggregatedReview.reviewVerdict,
        policyReasons: mergePolicyReasons(
          governance.policyReasons,
          aggregatedReview.policyReasons
        )
      },
      revisionRequest:
        aggregatedReview.reviewVerdict === "needs_revision"
          ? aggregatedReview.revisionRequest
          : undefined
    };

    if (aggregatedReview.reviewVerdict === "rejected") {
      task = transitionTask(task, { type: "review.rejected" });
      return options.persistTask(task, "task.review_rejected");
    }

    if (aggregatedReview.reviewVerdict === "needs_revision") {
      if (ensureGovernance(task).revisionCount >= 2) {
        task = createRevisionLimitRejection(task);
        task = transitionTask(task, { type: "review.rejected" });
        return options.persistTask(task, "task.review_rejected");
      }

      task = transitionTask(task, { type: "review.revision_requested" });
      return options.persistTask(task, "task.review_revision_requested");
    }

    if (ensureGovernance(task).effectiveRequiresApproval) {
      task = transitionTask(task, { type: "review.approved" });
      await options.persistTask(task, "task.review_approved");

      const approvalStep = await awaitStep(task, {
        label: "approval-gate",
        prompt: APPROVAL_PROMPT,
        actions: ["approve", "reject"],
        metadata: options.runMetadata
      });
      task = approvalStep.task;
      const approvalRun = approvalStep.run;
      task = appendRun(task, approvalRun, "approval");
      task = {
        ...task,
        approvalRunId: approvalRun.id,
        approvalRequest: {
          runId: approvalRun.id,
          prompt: approvalRun.awaitPrompt ?? APPROVAL_PROMPT,
          actions: approvalRun.allowedActions ?? ["approve", "reject"]
        }
      };

      return options.persistTask(task, "task.awaiting_approval");
    }

    task = transitionTask(task, { type: "review.approved_without_approval" });
    await options.persistTask(task, "task.review_approved_without_approval");
    return runExecutionAndVerification({
      task,
      persistTask: options.persistTask,
      runMetadata: options.runMetadata
    });
  }

  async function submitGovernanceAction(
    taskId: string,
    action: TaskAction,
    note?: string
  ): Promise<TaskProjectionRecord> {
    const current = await store.getTask(taskId);

    if (!current) {
      if (action === "approve" || action === "reject") {
        throw new Error(`Task ${taskId} is not awaiting approval`);
      }

      throw new Error(`Task ${taskId} not found`);
    }

    assertActionAllowed(current, action);
    assertApprovalActionAllowed(current, action);

    if (action === "approve" || action === "reject") {
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
          content: action
        }
      );

      let task = transitionTask(current, {
        type: action === "approve" ? "approval.granted" : "approval.rejected"
      });
      task = updateExistingRunSummary(task, resumedApprovalRun, "approval");
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined
      };

      if (action === "approve") {
        await persistTask(task, "task.approved");

        return runExecutionAndVerification({
          task,
          persistTask,
          runMetadata: { taskId }
        });
      }

      return persistTask(task, "task.rejected");
    }

    const trimmedNote = note?.trim() ?? "";

    if (trimmedNote.length === 0) {
      throw new Error("Revision note must not be empty");
    }

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

  return {
    async createTask(spec: TaskSpec): Promise<TaskProjectionRecord> {
      const runMetadata = { taskId: spec.id };
      let task = transitionTask(newTask(spec), { type: "task.submitted" });
      const persistTask = createPersistTask({
        store,
        initialVersion: 0
      });

      await persistTask(task, "task.submitted");

      const intakeStep = await runStep(task, "intake", {
        agent: "intake-agent",
        messages: [{ role: "user", content: spec.prompt }],
        metadata: runMetadata
      });
      task = intakeStep.task;
      const intakeRun = intakeStep.run;
      task = transitionTask(task, { type: "intake.completed" });
      task = appendArtifact(task, intakeRun.id, "taskspec", intakeRun.artifacts[0]?.content);
      task = appendRun(task, intakeRun, "intake");
      await persistTask(task, "task.intake_completed");

      return runPlanningReviewAndBranch({
        task,
        persistTask,
        runMetadata
      });
    },

    submitGovernanceAction,

    async approveTask(taskId: string): Promise<TaskProjectionRecord> {
      return submitGovernanceAction(taskId, "approve");
    },

    async rejectTask(taskId: string): Promise<TaskProjectionRecord> {
      return submitGovernanceAction(taskId, "reject");
    },

    async submitRevision(taskId: string, note: string): Promise<TaskProjectionRecord> {
      return submitGovernanceAction(taskId, "revise", note);
    },

    async recoverTask(taskId: string, noteInput: string): Promise<TaskProjectionRecord> {
      const current = await store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "recover", note);

      const persistTask = createPersistTask({
        store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.recovered"
      });
      task = replaceLatestHistoryNote(task, `task.operator_recovered: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_recovered");
      await store.recordOperatorAction({
        taskId,
        actionType: "recover",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_recovered" }
      });

      return runExecutionAndVerification({
        task: persisted,
        persistTask,
        runMetadata: { taskId }
      });
    },

    async takeoverTask(taskId: string, noteInput: string): Promise<TaskProjectionRecord> {
      const current = await store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "takeover", note);

      const persistTask = createPersistTask({
        store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.takeover_submitted"
      });
      task = replaceLatestHistoryNote(task, `task.operator_takeover_submitted: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined,
        governance: task.governance
          ? { ...task.governance, reviewVerdict: "pending" }
          : task.governance,
        revisionRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_takeover_submitted");
      await store.recordOperatorAction({
        taskId,
        actionType: "takeover",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_takeover_submitted" }
      });

      return runPlanningReviewAndBranch({
        task: persisted,
        persistTask,
        runMetadata: { taskId },
        revisionNote: note
      });
    },

    async abandonTask(taskId: string, noteInput: string): Promise<TaskProjectionRecord> {
      const current = await store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "abandon", note);

      const persistTask = createPersistTask({
        store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.abandoned"
      });
      task = replaceLatestHistoryNote(task, `task.operator_abandoned: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined,
        revisionRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_abandoned");
      await store.recordOperatorAction({
        taskId,
        actionType: "abandon",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_abandoned" }
      });

      return persisted;
    },

    async listTasks() {
      return store.listTasks();
    },

    async getTask(taskId: string) {
      return store.getTask(taskId);
    },

    async listOperatorActions(taskId: string) {
      return store.listOperatorActions(taskId);
    },

    async getOperatorActionSummary() {
      return store.getOperatorActionSummary();
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
      return runGateway.listAgents();
    }
  };
}
