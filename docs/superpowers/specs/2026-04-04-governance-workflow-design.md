# Codex Feudal Cluster Phase 3-2 Governance Workflow Design

## Overview
Phase 3-2 turns the existing task workflow into a real governance workflow rather than a mostly linear demo. The current system already models `requiresApproval`, `allowMock`, `sensitivity`, and `needs_revision`, but those concepts do not yet drive the authoritative control-plane behavior. Review output is mostly presentational, approval is always required, mock execution is controlled globally rather than per task, and the revision loop exists in the state machine without a usable end-to-end path.

This phase closes that gap by making governance decisions first-class workflow inputs. The control plane should decide whether a task must pause for approval, whether real execution may fall back to mock execution, how review verdicts branch the task, and when users may submit revision guidance to resume the planning loop. The web console should expose those governance decisions explicitly rather than hiding them behind fixed buttons and inferred status text.

## Scope
The goal is to deliver one coherent governance loop where:

1. task-level governance fields drive real control-plane decisions
2. review artifacts determine whether a task is approved, rejected, or sent back for revision
3. `high` sensitivity always forces an approval gate even when the user requested otherwise
4. `allowMock` allows per-task fallback from real ACP execution to mock execution
5. users can submit a revision note from the web console and re-enter planning with preserved audit history
6. APIs and UI surfaces expose governance state, policy reasons, execution mode, and allowed human actions

This phase remains single-user and single-machine. It improves workflow truth and operator visibility, but does not introduce multi-operator permissions, generalized policy engines, or new infrastructure beyond the existing real and mock ACP clients.

## Chosen Architecture
### Workflow Coordinator
The current `OrchestratorService` should stop acting like one long inline script. The workflow should be decomposed into explicit coordinator steps:

- task intake and planning
- review collection and verdict aggregation
- approval resolution when required
- execution and verification
- revision submission and re-entry into planning

The coordinator remains deterministic and stays inside `control-plane`, but each step should call smaller helpers rather than embedding all governance rules in one file.

### Governance Policy Layer
Phase 3-2 adds a thin task-level governance layer inside `control-plane`. It is responsible for:

- deriving `effectiveRequiresApproval` from user input and sensitivity
- choosing the task execution mode
- aggregating review verdicts
- computing the set of allowed human actions for the current task state
- emitting human-readable policy reasons for the UI and audit trail

This layer is intentionally narrow. It is not a generalized policy framework. It only covers the governance semantics already promised by the product design and current API schema.

### Task-Level Run Gateway
The workflow must stop depending on a single process-wide ACP mode. Instead, the coordinator should call a task-level run gateway that can:

- attempt a real ACP run first
- detect a real run failure
- retry the same step through the mock client when `allowMock` is enabled
- remember when fallback has been used so the rest of the task stays on the mock path

Once a task falls back to mock execution, the remaining workflow steps for that task should also use mock execution. This preserves audit clarity and avoids mixing real and mock results inside one authoritative task record.

### Projection And API Surface
Governance decisions should be projected into the task record returned by existing APIs. The web console should not infer governance state from raw statuses alone. The projection should provide explicit governance fields, revision metadata, and allowed actions so the UI can render the correct controls without duplicating business rules.

## Data Model
### Governance Projection
`TaskRecord` should gain a `governance` object with these persisted fields:

- `requestedRequiresApproval`
- `effectiveRequiresApproval`
- `allowMock`
- `sensitivity`
- `executionMode` with `real`, `real_with_mock_fallback`, or `mock_fallback_used`
- `policyReasons` as an ordered list of human-readable reasons
- `reviewVerdict` with `pending`, `approved`, `needs_revision`, or `rejected`
- `allowedActions` as the current human actions allowed on the task
- `revisionCount`

These values are part of task truth, not transient view state. They must survive persistence, replay, and restart recovery.

### Revision Request
When review requires revision, the task should persist a `revisionRequest` object containing:

- `note` summarizing why revision was requested
- `reviewerReasons` copied from the review artifacts that caused the branch
- `createdAt`

When the user submits a revision, the task should also persist the submitted revision note into the history-bearing task record so later replay can explain how the task re-entered planning.

## Workflow Semantics
### Review Verdict Aggregation
Review artifacts from `auditor-agent` and `critic-agent` should become authoritative governance inputs. Each review artifact must provide a structured `verdict` with one of:

- `approve`
- `needs_revision`
- `reject`

Aggregation uses a conservative priority order:

1. if any review returns `reject`, the task becomes `rejected`
2. otherwise, if any review returns `needs_revision`, the task becomes `needs_revision`
3. otherwise, the task passes review

If a review artifact omits `verdict` or provides an invalid value, the workflow should treat that review as `needs_revision`. Invalid review output should never silently pass a task through governance.

### Approval Requirement
Approval requirements are computed per task:

- if `sensitivity` is `high`, approval is mandatory
- otherwise, `effectiveRequiresApproval` matches the user-provided `requiresApproval`

When approval is required and review passes, the task transitions to `awaiting_approval` and exposes `approve` and `reject` as allowed actions. When approval is not required and review passes, the task proceeds directly to dispatch and execution without creating an approval pause.

### Revision Loop
When review aggregates to `needs_revision`, the task enters `needs_revision` and exposes `revise` as the allowed human action. The user does not edit the original title or prompt. Instead, the user submits a revision note from task detail, and the coordinator resumes the workflow from planning with:

- the original task prompt
- the latest revision note
- prior review reasons
- available artifacts that help explain context

The system should cap revision loops at two revision submissions. If a third review cycle still requests revision, the task is rejected with an explicit policy reason that the revision limit was reached.

### Execution Mode
Execution mode is chosen once per task and then updated only when fallback occurs:

- `allowMock = false` starts in `real`
- `allowMock = true` starts in `real_with_mock_fallback`

All worker-facing steps attempt real ACP first. If a real ACP call fails and `allowMock` is enabled, the workflow reruns that step through the mock ACP client, marks the task as `mock_fallback_used`, and continues the rest of the task through mock execution. If `allowMock` is disabled, real ACP failure keeps the existing failure behavior.

## State Machine Changes
The task state machine remains explicit and deterministic, but more branches become live:

- `review -> awaiting_approval` when review passes and approval is required
- `review -> dispatching` when review passes and approval is not required
- `review -> needs_revision` when review requests revision
- `review -> rejected` when review rejects the task
- `needs_revision -> planning` when the user submits a revision note

The rest of the execution path remains:

- `dispatching -> executing`
- `executing -> verifying`
- `verifying -> completed | partial_success | failed`

Illegal user actions should be rejected at the API layer with `409` responses rather than surfacing internal transition errors as generic `500` failures.

## API Plan
### Existing Task APIs
These paths remain and return the enriched governance projection:

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `POST /api/tasks`
- `POST /api/tasks/:taskId/approve`
- `POST /api/tasks/:taskId/reject`

Responses gain:

- `governance`
- `revisionRequest`

### New Revision API
Phase 3-2 adds:

- `POST /api/tasks/:taskId/revise`

Request body:

- `note`

The route is only valid when the task currently allows `revise`. On success it returns the updated task projection after the task has synchronously re-entered planning and review. The returned task may therefore land in `awaiting_approval`, `dispatching`, `needs_revision`, or `rejected` depending on the new review outcome and approval policy.

### Action Validation
Action routes should validate against `governance.allowedActions`:

- approving a task that is not awaiting approval returns `409`
- rejecting a task that is not awaiting approval returns `409`
- revising a task that is not in `needs_revision` returns `409`

This makes the API behavior match the web console and reduces state drift between front-end controls and back-end enforcement.

## Web Console Plan
### New Task Form
`New Task` should expose `allowMock` directly. When the user selects `high` sensitivity while disabling approval, the UI should explain that the task will still require approval because governance policy upgrades it automatically.

### Governance Inbox
The current approval inbox should become a governance inbox for all tasks waiting on user governance input:

- `awaiting_approval` tasks show approval and rejection controls
- `needs_revision` tasks show that revision is required and link the user toward task detail for note submission

The inbox should not invent workflow semantics. It should render from `governance.allowedActions` and the current task status.

### Task Detail
Task detail should add two governance-focused surfaces:

1. a governance panel showing:
   - sensitivity
   - requested and effective approval requirements
   - execution mode
   - review verdict
   - policy reasons
   - revision count
2. a revision panel showing the active revision request and a textarea for revision note submission when `revise` is allowed

This keeps the detail page as the authoritative operator surface for understanding why a task is paused and what governance path it followed.

## Error Handling
Phase 3-2 adds only governance-specific error paths:

- invalid or missing review verdicts become `needs_revision`
- real ACP failure with `allowMock = true` triggers task-level mock fallback
- real ACP failure with `allowMock = false` preserves task failure behavior
- `high` sensitivity plus `requiresApproval = false` records a policy override instead of throwing an input error
- exceeding the revision cap records a policy reason and rejects the task
- unsupported user actions return `409`

The phase does not introduce generalized compensation logic, human takeover commands, or manual replay mutation tools.

## Testing Strategy
The implementation should add four test layers:

1. contract and state machine tests for governance fields, new branches, and revision limits
2. control-plane service tests for approval overrides, review aggregation, revision resubmission, and mock fallback behavior
3. route tests for `POST /api/tasks/:taskId/revise`, governance projection payloads, and `409` action validation
4. web tests for `allowMock`, sensitivity messaging, governance inbox rendering, governance detail rendering, and revision submission

One end-to-end browser scenario should cover the minimum governance loop:

1. create a task
2. enter `needs_revision`
3. submit a revision note
4. enter approval
5. approve
6. complete

## Non-Goals
Phase 3-2 does not implement:

- a generalized policy framework for budget, security, or compliance
- multiple approval stages
- editable original task prompts during revision
- human takeover or arbitrary operator commands
- deep executor scheduling redesign
- multi-operator workflows or RBAC
- new ACP infrastructure beyond routing between the existing real and mock clients

## Success Criteria
Phase 3-2 is successful if:

- governance fields in task creation produce real workflow changes
- review output can branch the task into approval, rejection, or revision
- `high` sensitivity always enforces approval
- tasks may fall back from real ACP to mock ACP only when explicitly allowed
- users can complete one visible revision loop from the web console
- the UI can explain why a task is paused, what actions are allowed, and whether mock fallback was used
