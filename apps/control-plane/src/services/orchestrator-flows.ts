import type { ACPMessage, ACPRun } from "@feudal/acp";
import type { ACPRunSummary, TaskArtifact, TaskRecord } from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import { aggregateReviewVerdict } from "../governance/policy";
import { scanExecutionArtifacts } from "../security/execution-scanner";
import type { PersistTask, StepResult } from "./orchestrator-runtime";
import {
  createRevisionLimitRejection,
  ensureGovernance,
  mergePolicyReasons
} from "./task-metadata";

const APPROVAL_PROMPT = "Approve the decision brief?";
const FACT_CHECKER_AGENT = "fact-checker-agent";

export function toTaskArtifact(
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

function createGeneratedArtifactId(task: TaskRecord, kind: TaskArtifact["kind"]) {
  return `${kind}-${task.id}-${task.artifacts.filter((artifact) => artifact.kind === kind).length + 1}`;
}

function appendGeneratedArtifact(
  task: TaskRecord,
  kind: TaskArtifact["kind"],
  content: unknown
) {
  return {
    ...task,
    artifacts: [
      ...task.artifacts,
      {
        id: createGeneratedArtifactId(task, kind),
        kind,
        name: `${kind}.json`,
        mimeType: "application/json",
        content
      }
    ]
  };
}

function latestArtifact(task: TaskRecord, kind: TaskArtifact["kind"]) {
  return [...task.artifacts].reverse().find((artifact) => artifact.kind === kind);
}

function buildAssignmentArtifactContent(task: TaskRecord) {
  return {
    artifactType: "assignment",
    taskId: task.id,
    title: task.title,
    prompt: task.prompt,
    decisionBrief: latestArtifact(task, "decision-brief")?.content ?? null,
    factCheck: latestArtifact(task, "fact-check")?.content ?? null
  };
}

async function shouldRunFactChecker(
  listAgents?: () => Promise<Array<{ name: string; enabledByDefault?: boolean }>>
) {
  if (!listAgents) {
    return false;
  }

  const manifests = await listAgents();
  return manifests.some(
    (manifest) =>
      manifest.name === FACT_CHECKER_AGENT && manifest.enabledByDefault === true
  );
}

export function toRunSummary(
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

export function appendRun(task: TaskRecord, run: ACPRun, phase: ACPRunSummary["phase"]) {
  return {
    ...task,
    runIds: [...task.runIds, run.id],
    runs: [...task.runs, toRunSummary(run, phase)]
  };
}

export function appendArtifact(
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

export function updateExistingRunSummary(
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

export function revisionNoteMessage(note: string): ACPMessage {
  return {
    role: "user",
    content: `Revision note: ${note}`
  };
}

export async function runExecutionAndVerification(options: {
  task: TaskRecord;
  persistTask: PersistTask;
  runMetadata: Record<string, unknown>;
  runStep: (
    task: TaskRecord,
    phase: ACPRunSummary["phase"],
    input: {
      agent: string;
      messages: ACPMessage[];
      metadata?: Record<string, unknown>;
    }
  ) => Promise<StepResult>;
}) {
  let task = options.task;
  const assignmentContent = buildAssignmentArtifactContent(task);

  task = appendGeneratedArtifact(task, "assignment", assignmentContent);
  task = transitionTask(task, { type: "dispatch.completed" });
  let executorRun: ACPRun;

  try {
    const assignmentArtifact = latestArtifact(task, "assignment");
    const executionInput: {
      agent: string;
      messages: ACPMessage[];
      metadata: Record<string, unknown>;
    } = {
      agent: "gongbu-executor",
      messages: [
        {
          role: "user",
          content: JSON.stringify(assignmentArtifact?.content ?? assignmentContent)
        }
      ],
      metadata: options.runMetadata
    };

    let executeStep: StepResult;

    try {
      executeStep = await options.runStep(task, "execution", executionInput);
    } catch {
      executeStep = await options.runStep(task, "execution", executionInput);
    }

    task = executeStep.task;
    executorRun = executeStep.run;
  } catch {
    const failedTask = transitionTask(task, { type: "execution.failed" });
    return options.persistTask(failedTask, "task.execution_failed");
  }

  const securityScan = scanExecutionArtifacts(executorRun.artifacts);

  if (securityScan.blocked) {
    const failedTask = transitionTask(task, { type: "execution.failed" });
    const reportContent = {
      result: "blocked",
      reason: "execution_security_scan_blocked",
      securityScan
    };
    const taskWithSecurityReport = appendRun(
      appendArtifact(failedTask, executorRun.id, "execution-report", reportContent),
      executorRun,
      "execution"
    );

    return options.persistTask(
      taskWithSecurityReport,
      "task.execution_security_blocked"
    );
  }

  task = transitionTask(task, { type: "execution.completed" });

  const verifyStep = await options.runStep(task, "verification", {
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

export async function runPlanningReviewAndBranch(options: {
  task: TaskRecord;
  persistTask: PersistTask;
  runMetadata: Record<string, unknown>;
  revisionNote?: string;
  listAgents?: () => Promise<Array<{ name: string; enabledByDefault?: boolean }>>;
  runStep: (
    task: TaskRecord,
    phase: ACPRunSummary["phase"],
    input: {
      agent: string;
      messages: ACPMessage[];
      metadata?: Record<string, unknown>;
    }
  ) => Promise<StepResult>;
  awaitStep: (
    task: TaskRecord,
    input: {
      label: string;
      prompt: string;
      actions: string[];
      metadata?: Record<string, unknown>;
    }
  ) => Promise<StepResult>;
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

  const planningStep = await options.runStep(task, "planning", {
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

  if (await shouldRunFactChecker(options.listAgents)) {
    const factCheckStep = await options.runStep(task, "planning", {
      agent: FACT_CHECKER_AGENT,
      messages: [
        {
          role: "agent/analyst-agent",
          content: JSON.stringify(analystRun.artifacts[0]?.content)
        },
        {
          role: "user",
          content: task.prompt
        }
      ],
      metadata: options.runMetadata
    });
    task = appendArtifact(
      factCheckStep.task,
      factCheckStep.run.id,
      "fact-check",
      factCheckStep.run.artifacts[0]?.content
    );
    task = appendRun(task, factCheckStep.run, "planning");
    await options.persistTask(task, "task.fact_check_completed");
  }

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
  const factCheckArtifact = latestArtifact(task, "fact-check");

  if (factCheckArtifact) {
    reviewMessages.push({
      role: "agent/fact-checker-agent",
      content: JSON.stringify(factCheckArtifact.content)
    });
  }

  if (revisionNote) {
    reviewMessages.push(revisionNoteMessage(revisionNote));
  }

  const auditorStep = await options.runStep(task, "review", {
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

  const criticStep = await options.runStep(task, "review", {
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
      policyReasons: mergePolicyReasons(governance.policyReasons, [
        ...aggregatedReview.policyReasons,
        ...((factCheckArtifact?.content as { policyReasons?: string[] } | undefined)
          ?.policyReasons ?? [])
      ])
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

    const approvalStep = await options.awaitStep(task, {
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
    runMetadata: options.runMetadata,
    runStep: options.runStep
  });
}
