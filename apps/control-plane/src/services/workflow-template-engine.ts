import type { RunStep, AwaitStep, StepResult } from "./orchestrator-runtime";
import type { WorkflowTemplate, TemplateStep, TemplateInstantiation, TemplateCondition } from "./workflow-template-types";
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
    persistTask: (task: TaskRecord, eventType: string) => Promise<any>;
  }): Promise<void>;

  resolveExecutionOrder(steps: TemplateStep[]): string[];

  evaluateCondition(
    condition: TemplateCondition,
    stepOutputs: Record<string, unknown>
  ): boolean;
}

// ---- Internal helpers ----

function resolveExecutionOrder(steps: TemplateStep[]): string[] {
  // Stub — throws to fail tests during RED phase
  throw new Error("Not implemented — executeTemplate not built yet");
}

function evaluateCondition(
  _condition: TemplateCondition,
  _stepOutputs: Record<string, unknown>
): boolean {
  throw new Error("Not implemented — condition evaluator not built yet");
}

async function executeTemplate(options: {
  template: WorkflowTemplate;
  instantiation: TemplateInstantiation;
  baseTask: TaskRecord;
  runStep: RunStep;
  awaitStep: AwaitStep;
  persistTask: (task: TaskRecord, eventType: string) => Promise<any>;
}): Promise<void> {
  throw new Error("Not implemented — executeTemplate not built yet");
}

// ---- Factory ----

export function createWorkflowTemplateEngine(): WorkflowTemplateEngine {
  return {
    executeTemplate,
    resolveExecutionOrder,
    evaluateCondition,
  };
}
