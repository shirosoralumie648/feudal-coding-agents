import { describe, expect, it, vi } from "vitest";
import type { ACPRun } from "@feudal/acp";
import type { TaskRecord } from "@feudal/contracts";
import type { StepResult, RunStep, AwaitStep } from "./orchestrator-runtime";
import { createWorkflowTemplateEngine, DEFAULT_TEMPLATE } from "./workflow-template-engine";
import type { WorkflowTemplate, TemplateStep, TemplateInstantiation, TemplateCondition } from "./workflow-template-types";

// ---- Test helpers ----

function makeBaseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Test Task",
    prompt: "Do something",
    status: "draft",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    governance: { reviewVerdict: "pending", revisionCount: 0, allowedActions: [] },
    artifacts: [],
    runs: [],
    runIds: [],
    operatorActions: [],
    ...overrides,
  } as TaskRecord;
}

function makeRun(agent: string, content: unknown = { result: "success" }): ACPRun {
  return {
    id: `run-${agent}-${Date.now()}`,
    agent,
    status: "completed",
    messages: [],
    artifacts: [{ id: `art-${agent}`, name: "output.json", mimeType: "application/json", content }],
  };
}

function makeMockRunStep(
  behavior?: (task: TaskRecord, phase: string, input: { agent: string; messages: unknown[]; metadata?: Record<string, unknown> }) => StepResult
): RunStep {
  return vi.fn(async (task, phase, input) => {
    if (behavior) return behavior(task, phase, input);
    return { task, run: makeRun(input.agent) };
  });
}

function makeMockAwaitStep(
  behavior?: (task: TaskRecord, input: { label: string; prompt: string; actions: string[]; metadata?: Record<string, unknown> }) => StepResult
): AwaitStep {
  return vi.fn(async (task, input) => {
    if (behavior) return behavior(task, input);
    return { task, run: makeRun("human") };
  });
}

// ---- Test 1: executeTemplate executes steps in dependency order ----

describe("executeTemplate — dependency order", () => {
  it("executes step-A first, then step-B, when step-B depends on step-A", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep();
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "two-step",
      version: "1.0.0",
      parameters: [],
      steps: [
        { id: "step-A", type: "intake", agent: "agent-a", dependsOn: [], config: {} },
        { id: "step-B", type: "planning", agent: "agent-b", dependsOn: ["step-A"], config: {} },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "two-step",
      templateVersion: "1.0.0",
      parameters: {},
    };

    await engine.executeTemplate({
      template,
      instantiation,
      baseTask: makeBaseTask(),
      runStep,
      awaitStep,
      persistTask,
    });

    expect(runStep).toHaveBeenCalledTimes(2);
    const calls = (runStep as ReturnType<typeof vi.fn>).mock.calls;
    // First call: step-A
    expect(calls[0][2].agent).toBe("agent-a");
    // Second call: step-B
    expect(calls[1][2].agent).toBe("agent-b");
  });
});

// ---- Test 2: executeTemplate interpolates ${params.xxx} in step config ----

describe("executeTemplate — parameter interpolation", () => {
  it("interpolates ${params.xxx} references in step config before passing to RunStep", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep();
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "parameterized",
      version: "1.0.0",
      parameters: [{ name: "greeting", type: "string", required: true, description: "Greeting message" }],
      steps: [
        { id: "hello", type: "intake", agent: "greeter", dependsOn: [], config: { prompt: "${params.greeting} world!" } },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "parameterized",
      templateVersion: "1.0.0",
      parameters: { greeting: "Hello" },
    };

    await engine.executeTemplate({
      template,
      instantiation,
      baseTask: makeBaseTask(),
      runStep,
      awaitStep,
      persistTask,
    });

    const callInput = (runStep as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const content = JSON.parse((callInput.messages as Array<{ role: string; content: string }>)[0].content);
    expect(content.prompt).toBe("Hello world!");
  });
});

// ---- Test 3: executeTemplate throws when required parameter is missing ----

describe("executeTemplate — parameter validation", () => {
  it("throws when a required parameter is not provided in TemplateInstantiation", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep();
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "requires-param",
      version: "1.0.0",
      parameters: [{ name: "apiKey", type: "string", required: true, description: "API key" }],
      steps: [
        { id: "step-1", type: "intake", agent: "agent-1", dependsOn: [], config: {} },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "requires-param",
      templateVersion: "1.0.0",
      parameters: {}, // missing "apiKey"
    };

    await expect(
      engine.executeTemplate({
        template,
        instantiation,
        baseTask: makeBaseTask(),
        runStep,
        awaitStep,
        persistTask,
      })
    ).rejects.toThrow(/Parameter validation failed/);
  });
});

// ---- Test 4: resolveExecutionOrder — topological sort ----

describe("resolveExecutionOrder", () => {
  it("returns steps in topological order", () => {
    const engine = createWorkflowTemplateEngine();
    const steps: TemplateStep[] = [
      { id: "A", type: "intake", agent: "a", dependsOn: [], config: {} },
      { id: "B", type: "planning", agent: "b", dependsOn: [], config: {} },
      { id: "C", type: "review", agent: "c", dependsOn: ["A", "B"], config: {} },
      { id: "D", type: "execution", agent: "d", dependsOn: ["C"], config: {} },
    ];

    const order = engine.resolveExecutionOrder(steps);

    // A and B have no dependencies — must come before C
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
    // C depends on A and B — must come before D
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("D"));
    // All 4 steps present
    expect(order).toHaveLength(4);
  });

  it("places step with no dependsOn first, and step depending on two others after both", () => {
    const engine = createWorkflowTemplateEngine();
    const steps: TemplateStep[] = [
      { id: "root", type: "intake", agent: "r", dependsOn: [], config: {} },
      { id: "mid", type: "planning", agent: "m", dependsOn: ["root"], config: {} },
      { id: "leaf", type: "review", agent: "l", dependsOn: ["root", "mid"], config: {} },
    ];

    const order = engine.resolveExecutionOrder(steps);

    expect(order[0]).toBe("root");
    expect(order.indexOf("mid")).toBeLessThan(order.indexOf("leaf"));
  });
});

// ---- Test 5: resolveExecutionOrder detects cycles ----

describe("resolveExecutionOrder — cycle detection", () => {
  it("detects a dependency cycle and throws a descriptive error", () => {
    const engine = createWorkflowTemplateEngine();
    const steps: TemplateStep[] = [
      { id: "A", type: "intake", agent: "a", dependsOn: ["B"], config: {} },
      { id: "B", type: "planning", agent: "b", dependsOn: ["A"], config: {} },
    ];

    expect(() => engine.resolveExecutionOrder(steps)).toThrow(/Circular dependency detected/);
  });
});

// ---- Test 6: executeTemplate uses AwaitStep for approval steps ----

describe("executeTemplate — approval step dispatch", () => {
  it("calls AwaitStep instead of RunStep for an approval-type step", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep();
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "with-approval",
      version: "1.0.0",
      parameters: [],
      steps: [
        { id: "plan", type: "planning", agent: "analyst", dependsOn: [], config: {} },
        { id: "gate", type: "approval", agent: "human-operator", dependsOn: ["plan"], config: { prompt: "Approve?", actions: ["approve", "reject"] } },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "with-approval",
      templateVersion: "1.0.0",
      parameters: {},
    };

    await engine.executeTemplate({
      template,
      instantiation,
      baseTask: makeBaseTask(),
      runStep,
      awaitStep,
      persistTask,
    });

    // RunStep called once for plan, AwaitStep called once for gate
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(awaitStep).toHaveBeenCalledTimes(1);
  });
});

// ---- Test 7: executeTemplate passes accumulated outputs to condition evaluator ----

describe("executeTemplate — condition evaluation with step outputs", () => {
  it("passes accumulated step outputs as context to the condition evaluator", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep((_task, _phase, input) => {
      // Step-A outputs a verdict
      if (input.agent === "agent-a") {
        const run = makeRun("agent-a", { verdict: "approved" });
        return { task: makeBaseTask(), run };
      }
      // Step-B outputs a report
      return { task: makeBaseTask(), run: makeRun("agent-b", { report: "all good" }) };
    });
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "conditional-flow",
      version: "1.0.0",
      parameters: [],
      steps: [
        {
          id: "step-A",
          type: "intake",
          agent: "agent-a",
          dependsOn: [],
          config: {},
        },
        {
          id: "step-B",
          type: "planning",
          agent: "agent-b",
          dependsOn: ["step-A"],
          conditions: [
            { sourceStepId: "step-A", path: "verdict", operator: "equals", value: "approved" },
          ],
          config: {},
        },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "conditional-flow",
      templateVersion: "1.0.0",
      parameters: {},
    };

    await engine.executeTemplate({
      template,
      instantiation,
      baseTask: makeBaseTask(),
      runStep,
      awaitStep,
      persistTask,
    });

    // step-A runs because no conditions
    // step-B runs because step-A output verdict == "approved"
    expect(runStep).toHaveBeenCalledTimes(2);
  });

  it("skips step when condition evaluates to false", async () => {
    const engine = createWorkflowTemplateEngine();
    const runStep = makeMockRunStep((_task, _phase, input) => {
      if (input.agent === "agent-a") {
        const run = makeRun("agent-a", { verdict: "rejected" });
        return { task: makeBaseTask(), run };
      }
      return { task: makeBaseTask(), run: makeRun("agent-b") };
    });
    const awaitStep = makeMockAwaitStep();
    const persistTask = vi.fn(async () => ({}));

    const template: WorkflowTemplate = {
      name: "skip-flow",
      version: "1.0.0",
      parameters: [],
      steps: [
        { id: "step-A", type: "intake", agent: "agent-a", dependsOn: [], config: {} },
        {
          id: "step-B",
          type: "planning",
          agent: "agent-b",
          dependsOn: ["step-A"],
          conditions: [
            { sourceStepId: "step-A", path: "verdict", operator: "equals", value: "approved" },
          ],
          config: {},
        },
        {
          id: "step-C",
          type: "review",
          agent: "agent-c",
          dependsOn: ["step-B"],
          config: {},
        },
      ],
      status: "published",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z",
      eventVersion: 1,
    };

    const instantiation: TemplateInstantiation = {
      templateName: "skip-flow",
      templateVersion: "1.0.0",
      parameters: {},
    };

    await engine.executeTemplate({
      template,
      instantiation,
      baseTask: makeBaseTask(),
      runStep,
      awaitStep,
      persistTask,
    });

    // Only step-A runs; step-B is skipped due to failed condition
    // step-C is skipped because it depends on step-B which was skipped
    // (step-C has no satisfied dependencies - step-B never ran)
    expect(runStep).toHaveBeenCalledTimes(1);
    const calls = (runStep as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][2].agent).toBe("agent-a");
  });
});

// ---- Task 2: DEFAULT_TEMPLATE structure ----

describe("DEFAULT_TEMPLATE", () => {
  it("has name 'default', semver version, status 'published', and 6 steps in dependency order", () => {
    const engine = createWorkflowTemplateEngine();
    const tmpl = engine.DEFAULT_TEMPLATE!;

    expect(tmpl.name).toBe("default");
    expect(tmpl.version).toMatch(/^\d+\.\d+\.\d+/); // semver
    expect(tmpl.status).toBe("published");
    expect(tmpl.steps).toHaveLength(6);

    const order = engine.resolveExecutionOrder(tmpl.steps);
    // intake → planning → review → approval → execution → verification
    const intakeIdx = order.indexOf("intake");
    const planningIdx = order.indexOf("planning");
    const reviewIdx = order.indexOf("review");
    const approvalIdx = order.indexOf("approval");
    const executionIdx = order.indexOf("execution");
    const verificationIdx = order.indexOf("verification");

    expect(intakeIdx).toBeLessThan(planningIdx);
    expect(planningIdx).toBeLessThan(reviewIdx);
    expect(reviewIdx).toBeLessThan(approvalIdx);
    expect(approvalIdx).toBeLessThan(executionIdx);
    expect(executionIdx).toBeLessThan(verificationIdx);
  });

  it("step 'review' uses agent 'auditor-agent'", () => {
    const engine = createWorkflowTemplateEngine();
    const reviewStep = engine.DEFAULT_TEMPLATE!.steps.find((s) => s.id === "review");
    expect(reviewStep).toBeDefined();
    expect(reviewStep!.agent).toBe("auditor-agent");
  });

  it("step 'approval' has type 'approval' (triggers AwaitStep path)", () => {
    const engine = createWorkflowTemplateEngine();
    const approvalStep = engine.DEFAULT_TEMPLATE!.steps.find((s) => s.id === "approval");
    expect(approvalStep).toBeDefined();
    expect(approvalStep!.type).toBe("approval");
  });

  it("step 'execution' dependsOn ['approval'] and step 'verification' dependsOn ['execution']", () => {
    const engine = createWorkflowTemplateEngine();
    const execStep = engine.DEFAULT_TEMPLATE!.steps.find((s) => s.id === "execution");
    const verifyStep = engine.DEFAULT_TEMPLATE!.steps.find((s) => s.id === "verification");
    expect(execStep!.dependsOn).toEqual(["approval"]);
    expect(verifyStep!.dependsOn).toEqual(["execution"]);
  });
});

// ---- Task 2: evaluateCondition edge cases ----

describe("evaluateCondition — edge cases", () => {
  it("returns false when the source path does not exist in stepOutputs (missing key)", () => {
    const engine = createWorkflowTemplateEngine();
    const stepOutputs = { "step-A": { result: { status: "ok" } } };

    const result = engine.evaluateCondition(
      { sourceStepId: "step-A", path: "output.result", operator: "equals", value: "ok" },
      stepOutputs
    );

    // "output.result" does not exist (the key is "result", not "output")
    expect(result).toBe(false);
  });

  it("returns true when operator 'contains' matches a substring", () => {
    const engine = createWorkflowTemplateEngine();
    const stepOutputs = { "step-A": { verdict: "approved_partial" } };

    const result = engine.evaluateCondition(
      { sourceStepId: "step-A", path: "verdict", operator: "contains", value: "approved" },
      stepOutputs
    );

    expect(result).toBe(true);
  });
});
