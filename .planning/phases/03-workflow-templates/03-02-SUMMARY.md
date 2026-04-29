---
phase: 03-workflow-templates
plan: 02
subsystem: workflow
tags: [typescript, topological-sort, condition-evaluation, template-engine, orchestration]

# Dependency graph
requires:
  - phase: 03-workflow-templates
    provides: "workflow-template-types.ts (WorkflowTemplate, TemplateStep, TemplateCondition, TemplateInstantiation) and workflow-template-params.ts (interpolateParams, validateParameters)"
provides:
  - "WorkflowTemplateEngine with executeTemplate, resolveExecutionOrder, evaluateCondition"
  - "Built-in DEFAULT_TEMPLATE mirroring orchestrator-flows.ts hardcoded flow"
  - "Topological sort with cycle detection for step dependency resolution"
  - "Condition evaluation with equals, notEquals, contains operators against accumulated step outputs"
affects: [03-03 (template validation), 03-04 (template API routes)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Coordinator factory pattern — createWorkflowTemplateEngine() returns engine object with injected domain functions; consistent with createGovernanceCoordinator() in governance-coordinator.ts"]

key-files:
  created:
    - apps/control-plane/src/services/workflow-template-engine.ts
    - apps/control-plane/src/services/workflow-template-engine.test.ts
  modified: []

key-decisions:
  - "Used Kahn's algorithm for topological sort with explicit cycle detection error message"
  - "Steps with all conditions failing are skipped; dependent steps of skipped steps cascade-skip"
  - "DEFAULT_TEMPLATE exposed as readonly property on engine instance, not as module-level export"
  - "All template execution dependencies (runStep, awaitStep, persistTask) injected per-call via options, not constructor injection"

patterns-established:
  - "Factory function returns typed engine object (factory pattern consistent with governance-coordinator)"
  - "Pure domain functions (resolveExecutionOrder, evaluateCondition, resolvePath) are module-private; only exposed via engine interface"

requirements-completed: [WFT-01, WFT-02]

# Metrics
duration: 6m
completed: 2026-04-29
---

# Phase 3 Plan 2: WorkflowTemplateEngine with topological sort, condition evaluation, and DEFAULT_TEMPLATE

**Config-driven template execution engine that dynamically orchestrates workflow steps via dependency resolution, condition evaluation, and existing orchestrator runtime dispatch**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-29T09:49:40Z
- **Completed:** 2026-04-29T09:55:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- WorkflowTemplateEngine with executeTemplate, resolveExecutionOrder, and evaluateCondition methods
- Kahn's algorithm topological sort with cycle detection (descriptive error: "Circular dependency detected: A -> B")
- Condition evaluation supporting equals, notEquals, contains operators against accumulated step outputs
- Approval steps automatically dispatch via AwaitStep; non-approval steps dispatch via RunStep
- Built-in DEFAULT_TEMPLATE mirroring the current orchestrator-flows.ts 6-step flow (intake -> planning -> review -> approval -> execution -> verification)
- Cascading skip: steps whose dependencies were skipped are also skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine core (TDD)** - `dcd4c91` (test: RED), `a6c5a3d` (feat: GREEN)
2. **Task 2: DEFAULT_TEMPLATE and edge cases (TDD)** - included in `d078718` (test + feat: RED + GREEN)

## Files Created/Modified
- `apps/control-plane/src/services/workflow-template-engine.ts` - WorkflowTemplateEngine class with topological sort, condition evaluation, step dispatch, and DEFAULT_TEMPLATE (354 lines)
- `apps/control-plane/src/services/workflow-template-engine.test.ts` - 15 tests covering dependency ordering, parameter interpolation, validation, cycle detection, approval dispatch, condition evaluation, DEFAULT_TEMPLATE structure, and edge cases

## Decisions Made
- Used Kahn's algorithm for topological sort — standard, well-understood, detects cycles cleanly
- Step conditions are evaluated in aggregate: if ALL fail, skip; if ANY pass, execute (per D-04)
- Dependent steps of skipped steps are cascade-skipped — avoids executing steps with unsatisfied dependencies
- DEFAULT_TEMPLATE exposed as readonly property on the engine instance (not module-level export) for consistency with the engine interface
- runStep phase argument uses `step.type as never` — step types are already validated by Zod schema in 03-01 and directly map to ACPRunSummaryPhase values

## Deviations from Plan

None — plan executed exactly as written. All behaviors, acceptance criteria, and success criteria were met without deviations.

## Issues Encountered

None.

## Known Stubs

None — all interfaces are fully implemented and tested.

## Threat Flags

None — the engine introduces no new network endpoints, auth paths, or file access patterns beyond what was modeled in the plan's threat model. The engine operates entirely within the existing trust boundaries: it calls RunStep/AwaitStep (already existing runtime), validates parameters via validateParameters (from 03-01, mitigates injection), and detects cycles before execution (mitigates DoS).

## Next Phase Readiness
- WorkflowTemplateEngine is ready for integration into orchestrator-service.ts (Phase 03-03 or 03-04)
- DEFAULT_TEMPLATE can serve as the immediate replacement for the hardcoded orchestrator-flows.ts flow
- Template execution is fully testable with mock RunStep/AwaitStep — no infrastructure dependencies required for downstream plans

---
*Phase: 03-workflow-templates*
*Plan: 02*
*Completed: 2026-04-29*

## Self-Check: PASSED

- `apps/control-plane/src/services/workflow-template-engine.ts` — FOUND
- `apps/control-plane/src/services/workflow-template-engine.test.ts` — FOUND
- Commit `dcd4c91` (test RED) — FOUND
- Commit `a6c5a3d` (feat GREEN Task 1) — FOUND
- Commit `d078718` (feat GREEN Task 2) — FOUND
- All 15 tests pass (0 failures in engine test suite, only pre-existing smoke.test.ts failure)
