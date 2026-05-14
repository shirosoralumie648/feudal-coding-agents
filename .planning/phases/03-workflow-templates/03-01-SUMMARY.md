---
phase: 03-workflow-templates
plan: 01
subsystem: workflow-templates
tags: [types, schemas, interpolation, dsl]
requires: []
provides: [workflow-template-types, workflow-template-params]
affects: []
tech-stack:
  added: [zod-v4]
  patterns: [zod-schema-validation, recursive-interpolation, tdd-red-green]
key-files:
  created:
    - apps/control-plane/src/services/workflow-template-types.ts
    - apps/control-plane/src/services/workflow-template-types.test.ts
    - apps/control-plane/src/services/workflow-template-params.ts
    - apps/control-plane/src/services/workflow-template-params.test.ts
  modified: []
key-decisions:
  - "Zod v4 schemas co-located with explicit TypeScript interfaces for canonical types"
  - "Step type enum maps to existing ACPRunSummaryPhase (intake/planning/review/approval/execution/verification)"
  - "Parameter interpolation uses recursive ${params.paramName} replacement with error on missing params"
  - "Semver version validation via regex /^\\d+\\.\\d+\\.\\d+(-[\\w.-]+)?(\\+[\\w.-]+)?$/"
requirements-completed:
  - WFT-01
  - WFT-02
duration: "11 min"
completed: 2026-04-29
---

# Phase 3 Plan 1: Workflow Template Types and Parameter Interpolation Summary

WorkflowTemplate domain type system with Zod v4 validation schemas and recursive parameter interpolation engine using `${params.paramName}` syntax.

## One-Liner

Define the WorkflowTemplate DSL contract layer (types, Zod schemas, parameter interpolation) that all downstream workflow template plans build against.

## Tasks Completed

| # | Task | Type | Commit | Status |
|---|------|------|--------|--------|
| 1 | Define template types and Zod validation schemas | tdd | 4403aa6 (RED), a98b795 (GREEN) | Complete |
| 2 | Implement parameter interpolation engine | tdd | f83ba0a (RED), dbb54e3 (GREEN) | Complete |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `apps/control-plane/src/services/workflow-template-types.ts` | 139 | TypeScript interfaces and Zod schemas for WorkflowTemplate, TemplateStep, TemplateParameter, TemplateCondition, TemplateInstantiation, TemplateExportPackage |
| `apps/control-plane/src/services/workflow-template-types.test.ts` | 402 | 32 tests covering all schemas, enum validation, semver regex, conditional requirements |
| `apps/control-plane/src/services/workflow-template-params.ts` | 68 | interpolateParams (recursive ${params.name} replacement) and validateParameters functions |
| `apps/control-plane/src/services/workflow-template-params.test.ts` | 169 | 15 tests covering interpolation, nested objects/arrays, missing param errors, validation |

## Implementation Details

### Task 1: Template Types and Zod Schemas

**Exported interfaces:**
- `TemplateParameter` — name, type (string|number|boolean|enum), required, description, optional default/enumValues
- `TemplateCondition` — sourceStepId, path, operator (equals|notEquals|contains), value
- `TemplateStep` — id, type (intake|planning|review|approval|execution|verification), agent, dependsOn[], optional conditions/config
- `WorkflowTemplate` — name, version (semver), parameters[], steps[], status (draft|published), timestamps, eventVersion
- `TemplateInstantiation` — templateName, templateVersion, parameters record
- `TemplateExportPackage` — format "feudal-template/v1", template, exportedAt

**Zod schemas (all exported):** WorkflowTemplateSchema, TemplateParameterSchema, TemplateStepSchema, TemplateConditionSchema, TemplateInstantiationSchema, TemplateExportPackageSchema

**Key constraints enforced:**
- D-03: Step type enum of 6 values matches ACPRunSummaryPhase
- D-06: Parameter type enum of 4 values (string, number, boolean, enum)
- D-16: Version validated by semver regex, accepts pre-release and build suffixes
- Conditional enumValues requirement when parameter type is "enum"

### Task 2: Parameter Interpolation Engine

**interpolateParams(value, parameters):** Recursively replaces `${params.paramName}` references:
- String values: regex replacement with `String(parameters[name])`
- Array values: map over each element
- Object values: iterate over each property
- Primitives: returned unchanged
- Throws `Error('Template parameter "name" not provided')` on missing references

**validateParameters(templateParams, providedParams):** Returns string[] of errors:
- Checks all required parameters are present
- Allows extra provided parameters (forward compatibility)
- Empty array = valid

## Decisions Made

1. **Explicit interfaces + Zod schemas**: Both canonical TypeScript interfaces and Zod validation schemas are exported. Interfaces serve as compile-time contracts; schemas handle runtime validation. This satisfies both the plan's `export interface` grep requirements and the Zod validation pattern used throughout the codebase.

2. **RECURSIVE interpolation**: `interpolateParams` recurses into nested objects and arrays rather than only handling top-level strings. This matches the plan's behavior spec (test 3).

3. **Forward-compatible validateParameters**: Extra parameters in `providedParameters` that don't match any `TemplateParameter` are silently accepted, not rejected. This allows templates to evolve without breaking existing instantiations.

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

All TDD gates passed:

| Gate | Task 1 Commit | Task 2 Commit |
|------|---------------|---------------|
| RED | 4403aa6 — `test(03-01): add failing tests for workflow template types and Zod schemas` | f83ba0a — `test(03-01): add failing tests for parameter interpolation engine` |
| GREEN | a98b795 — `feat(03-01): implement workflow template types and Zod validation schemas` | dbb54e3 — `feat(03-01): implement parameter interpolation engine with validateParameters` |

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `WorkflowTemplateSchema` defined in types.ts | PASS (1 occurrence) |
| 2 | `export interface WorkflowTemplate` in types.ts | PASS (1 occurrence) |
| 3 | `TemplateStepSchema` defined in types.ts | PASS (3 occurrences) |
| 4 | `interpolateParams` exported from params.ts | PASS (3 occurrences) |
| 5 | `validateParameters` exported from params.ts | PASS (1 occurrence) |
| 6 | All tests pass (47 total across 2 test files) | PASS |

## Test Coverage

- **workflow-template-types.test.ts**: 32 tests — schema validation, enum restrictions, semver regex, conditional requirements, missing fields, invalid types
- **workflow-template-params.test.ts**: 15 tests — string interpolation, multiple refs, nested objects/arrays, missing param errors, primitives, validateParameters edge cases

## Threat Model Compliance

All STRIDE mitigations implemented:
- T-03-01 (Tampering — param type): Zod enum validation restricts to "string"|"number"|"boolean"|"enum"
- T-03-02 (Tampering — step type): Zod enum validation restricts to six allowed values
- T-03-03 (Info Disclosure — interpolation): Missing param throws explicit error, prevents silent "undefined" injection
- T-03-04 (EoP — type system only): Accepted — no execution/access control logic in this plan

## Self-Check: PASSED

All 4 created files exist and all 4 commits are verified in git log.
