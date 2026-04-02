import { createMockACPClient } from "@feudal/acp/mock-client";
import type { TaskArtifact, TaskRecord, TaskSpec } from "@feudal/contracts";
import { transitionTask } from "@feudal/orchestrator";
import { MemoryStore } from "../store";

const acp = createMockACPClient();
const store = new MemoryStore();

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
    messages: [
      {
        role: "agent/intake-agent",
        content: JSON.stringify(intakeRun.artifacts[0]?.content)
      }
    ]
  });
  task = transitionTask(task, { type: "planning.completed" });

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
      toTaskArtifact(auditorRun.id, "review", auditorRun.artifacts[0]?.content),
      toTaskArtifact(criticRun.id, "review", criticRun.artifacts[0]?.content)
    ],
    runIds: [
      intakeRun.id,
      analystRun.id,
      auditorRun.id,
      criticRun.id,
      approvalRun.id
    ],
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
    messages: [
      {
        role: "agent/gongbu-executor",
        content: JSON.stringify(executorRun.artifacts[0]?.content)
      }
    ]
  });
  task = transitionTask(task, { type: "verification.passed" });

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
