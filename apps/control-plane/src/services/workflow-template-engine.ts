import type { RunStep, AwaitStep } from "./orchestrator-runtime";
import type {
  WorkflowTemplate,
  TemplateStep,
  TemplateInstantiation,
  TemplateCondition,
} from "./workflow-template-types";
import { interpolateParams, validateParameters } from "./workflow-template-params";
import type { TaskRecord } from "@feudal/contracts";

// ---- Types ----

export interface WorkflowTemplateEngine {
  executeTemplate(options: {
    template: WorkflowTemplate;
    instantiation: TemplateInstantiation;
    baseTask: TaskRecord;
    runStep: RunStep;
    awaitStep: AwaitStep;
    persistTask: (task: TaskRecord, eventType: string) => Promise<void>;
  }): Promise<void>;

  resolveExecutionOrder(steps: TemplateStep[]): string[];

  evaluateCondition(
    condition: TemplateCondition,
    stepOutputs: Record<string, unknown>
  ): boolean;

  /** The built-in "default" template (D-11) — mirrors orchestrator-flows.ts */
  readonly DEFAULT_TEMPLATE: WorkflowTemplate;
}

// ---- Pure domain functions ----

/**
 * Topologically sorts TemplateStep IDs using Kahn's algorithm.
 * Steps with empty dependsOn come first; a step depending on N others
 * comes after all N. Detects cycles and throws.
 */
function resolveExecutionOrder(steps: TemplateStep[]): string[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  // Build adjacency
  for (const step of steps) {
    inDegree.set(step.id, step.dependsOn.length);
    for (const dep of step.dependsOn) {
      if (!stepMap.has(dep)) {
        throw new Error(
          `Step "${step.id}" depends on unknown step "${dep}"`
        );
      }
      const list = dependents.get(dep) ?? [];
      list.push(step.id);
      dependents.set(dep, list);
    }
  }

  // Seed queue with steps that have no dependencies
  const queue: string[] = [];
  for (const step of steps) {
    if (step.dependsOn.length === 0) {
      queue.push(step.id);
    }
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    // Remove current as a dependency from its dependents
    const deps = dependents.get(current) ?? [];
    for (const dep of deps) {
      const currentDegree = inDegree.get(dep)! - 1;
      inDegree.set(dep, currentDegree);
      if (currentDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // If not all steps processed, there is a cycle
  if (order.length < steps.length) {
    const unresolved = steps
      .filter((s) => !order.includes(s.id))
      .map((s) => s.id);
    throw new Error(
      `Circular dependency detected: ${unresolved.join(" -> ")}`
    );
  }

  return order;
}

/**
 * Evaluates a single TemplateCondition against accumulated step outputs.
 *
 * 1. Resolves sourceStepId → raw output object from that step
 * 2. Navigates dot-separated path (e.g., "result.status" → output.result.status)
 * 3. Applies operator (equals, notEquals, contains)
 * 4. Returns false for missing paths
 */
function evaluateCondition(
  condition: TemplateCondition,
  stepOutputs: Record<string, unknown>
): boolean {
  const sourceOutput = stepOutputs[condition.sourceStepId];
  if (sourceOutput === undefined || sourceOutput === null) {
    return false;
  }
  if (typeof sourceOutput !== "object" || Array.isArray(sourceOutput)) {
    return false;
  }

  // Navigate dot-separated path
  const actualValue = resolvePath(sourceOutput as Record<string, unknown>, condition.path);
  if (actualValue === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "equals":
      return actualValue === condition.value;
    case "notEquals":
      return actualValue !== condition.value;
    case "contains":
      return String(actualValue).includes(String(condition.value));
    default:
      return false;
  }
}

/**
 * Navigates a dot-separated path on an object.
 * Returns undefined if any segment is missing.
 */
function resolvePath(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

// ---- Template execution ----

async function executeTemplate(options: {
  template: WorkflowTemplate;
  instantiation: TemplateInstantiation;
  baseTask: TaskRecord;
  runStep: RunStep;
  awaitStep: AwaitStep;
  persistTask: (task: TaskRecord, eventType: string) => Promise<void>;
}): Promise<void> {
  const { template, instantiation, baseTask, runStep, awaitStep, persistTask } =
    options;

  // 1. Validate parameters
  const validationErrors = validateParameters(
    template.parameters,
    instantiation.parameters
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `Parameter validation failed: ${validationErrors.join(", ")}`
    );
  }

  // 2. Resolve execution order
  const executionOrder = resolveExecutionOrder(template.steps);
  const stepMap = new Map(template.steps.map((s) => [s.id, s]));

  // 3. Track outputs and skipped steps
  const stepOutputs: Record<string, unknown> = {};
  const skippedSteps = new Set<string>();
  let currentTask = baseTask;

  // 4. Execute steps in order
  for (const stepId of executionOrder) {
    const step = stepMap.get(stepId)!;

    // Check if any dependency was skipped — if so, skip this step too
    const hasSkippedDependency = step.dependsOn.some((depId) =>
      skippedSteps.has(depId)
    );
    if (hasSkippedDependency) {
      skippedSteps.add(stepId);
      continue;
    }

    // Evaluate conditions (per D-04)
    if (step.conditions && step.conditions.length > 0) {
      const conditionResults = step.conditions.map((cond) =>
        evaluateCondition(cond, stepOutputs)
      );
      // Skip if ALL conditions fail
      if (conditionResults.length > 0 && conditionResults.every((r) => !r)) {
        skippedSteps.add(stepId);
        continue;
      }
    }

    // Interpolate step config
    const interpolatedConfig = interpolateParams(
      step.config ?? {},
      instantiation.parameters
    ) as Record<string, unknown>;

    let result;

    if (step.type === "approval") {
      // Approval step → AwaitStep
      result = await awaitStep(currentTask, {
        label: "approval-gate",
        prompt:
          (interpolatedConfig.prompt as string) ?? "Approve?",
        actions:
          (interpolatedConfig.actions as string[]) ?? [
            "approve",
            "reject",
          ],
        metadata: { stepId: step.id },
      });
    } else {
      // Non-approval step → RunStep
      result = await runStep(currentTask, step.type as never, {
        agent: step.agent,
        messages: [
          {
            role: "user",
            content: JSON.stringify(interpolatedConfig),
          },
        ],
        metadata: { stepId: step.id },
      });
    }

    // Store output for downstream condition evaluation
    stepOutputs[stepId] =
      result.run.artifacts?.[0]?.content ?? null;

    // Update task reference
    currentTask = result.task;
  }

  // 5. Persist final task state
  await persistTask(currentTask, "task.template_completed");
}

// ---- Built-in default template (D-11) ----
// Mirrors the hardcoded flow in orchestrator-flows.ts:
// intake → planning → review → approval → execution → verification

export const DEFAULT_TEMPLATE: WorkflowTemplate = {
  name: "default",
  version: "1.0.0",
  parameters: [],
  steps: [
    {
      id: "intake",
      type: "intake",
      agent: "intake-agent",
      dependsOn: [],
      config: { prompt: "${params.prompt}" },
    },
    {
      id: "planning",
      type: "planning",
      agent: "analyst-agent",
      dependsOn: ["intake"],
      config: {
        messages: [
          { role: "agent/intake-agent", content: "${params.taskspec}" },
        ],
      },
    },
    {
      id: "review",
      type: "review",
      agent: "auditor-agent",
      dependsOn: ["planning"],
      config: {
        messages: [
          {
            role: "agent/analyst-agent",
            content: "${params.decisionBrief}",
          },
          { role: "user", content: "${params.prompt}" },
        ],
      },
    },
    {
      id: "approval",
      type: "approval",
      agent: "human-operator",
      dependsOn: ["review"],
      config: {
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"],
      },
    },
    {
      id: "execution",
      type: "execution",
      agent: "gongbu-executor",
      dependsOn: ["approval"],
      config: {
        artifactType: "assignment",
        taskId: "${params.taskId}",
        prompt: "${params.prompt}",
        decisionBrief: "${params.decisionBrief}",
      },
    },
    {
      id: "verification",
      type: "verification",
      agent: "xingbu-verifier",
      dependsOn: ["execution"],
      config: {
        messages: [
          {
            role: "agent/gongbu-executor",
            content: "${params.executionOutput}",
          },
        ],
      },
    },
  ],
  status: "published",
  createdAt: "2026-04-29T00:00:00.000Z",
  updatedAt: "2026-04-29T00:00:00.000Z",
  lastPublishedVersion: 1,
  eventVersion: 1,
};

// ---- Factory ----

export function createWorkflowTemplateEngine(): WorkflowTemplateEngine {
  return {
    executeTemplate,
    resolveExecutionOrder,
    evaluateCondition,
    DEFAULT_TEMPLATE,
  };
}
