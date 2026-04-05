# Codex Feudal Cluster Operator Console And Recovery Actions Design

## Overview
The current codebase can explain task history, replay task state, and mark ambiguous restart recovery as `recovery_required`, but it still cannot do anything authoritative with that information. Phase 3-1 deliberately stopped at read-only replay, and Phase 3-2 deliberately stopped at governance actions such as `approve`, `reject`, and `revise`. The system can now show that a task is stuck, failed, or ambiguous after restart, but it still lacks a first-class operator surface to resolve those states safely.

This design adds a narrow operator console focused on recovery actions rather than generalized human control. The goal is to let a single operator recover a task that should continue, take over a task that needs new human guidance, or intentionally abandon a task that should stop. These actions remain fully auditable, flow only through the `control-plane`, and preserve the deterministic task model already established by the current architecture.

## Scope
This phase delivers one coherent operator recovery loop where:

1. the web console exposes a dedicated operator surface separate from the existing governance inbox
2. the `control-plane` accepts three operator write actions: `recover`, `takeover`, and `abandon`
3. `recover` resumes a failed or restart-ambiguous task without changing its prompt or governance decisions
4. `takeover` sends the same task back to `planning` with an operator note and forces it through the normal governance loop again
5. `abandon` closes the task through a new explicit terminal state rather than overloading `rejected` or `rolled_back`
6. replay, rebuild, and audit views remain able to explain what operator command was requested, whether it was applied, and what state it changed

This phase remains single-user and single-machine. Operator commands execute directly without a second approval workflow, except that `abandon` requires explicit confirmation. The phase does not add RBAC, arbitrary free-form commands to agents, a new attempt model, or generalized compensation logic.

## Chosen Architecture
### Separate Operator Command Layer
The operator console should not extend the current governance action model directly. `approve`, `reject`, and `revise` remain governance actions tied to review and approval policy. `recover`, `takeover`, and `abandon` are operational recovery actions and should live in a separate command layer with their own validation rules, route family, and audit records.

This keeps the boundary clear:

- governance answers whether a task may proceed according to policy
- operator commands answer how a stuck or failed task should be handled by a human

The system should therefore keep the existing governance inbox intact and add a separate operator console surface for recovery work.

### Control-Plane Ownership
`control-plane` remains the only authoritative write entry point. The web console may render recovery summaries, operator history, replay context, and command forms, but it must never mutate storage directly. All operator writes flow through dedicated `control-plane` routes, which validate the task state, persist operator audit records, apply task-state mutations, and only then call ACP-facing orchestration logic if needed.

### Integration With Existing Workflow
The current `OrchestratorService` already owns task creation, approval, revision, dispatch, execution, and verification. This phase should extend that service, or a closely related task-scoped helper, with operator command handling. The implementation should not create a second independent task engine.

The task state machine remains authoritative. Operator commands do not mutate projections ad hoc. Each accepted operator command must result in explicit task events that produce legal task transitions and replayable history.

## Data Model
### Task Status
The shared `TaskStatus` contract gains one new terminal state:

- `abandoned`

`abandoned` means an operator intentionally stopped the task and decided not to continue it. It is distinct from:

- `rejected`, which remains the outcome of governance or review policy
- `rolled_back`, which remains reserved for compensation or rollback semantics
- `failed`, which remains an execution or verification failure that may still be recoverable

### Operator Action Contracts
Operator actions should be modeled separately from governance actions.

Existing governance contract:

- `TaskAction = approve | reject | revise`

New operator contracts:

- `OperatorActionType = recover | takeover | abandon`
- `OperatorActionRequest = { actionType, note, confirm? }`
- `OperatorActionRecord = { id, taskId, actionType, status, note, actorType, actorId?, createdAt, appliedAt?, rejectedAt?, rejectionReason? }`

All operator actions require a non-empty `note`. `abandon` also requires `confirm: true`.

### Task Projection Additions
The task projection returned to the web console should expose operator-facing state explicitly rather than forcing the UI to infer it from status alone.

The enriched projection should include:

- existing `recoveryState`
- existing `recoveryReason`
- `operatorAllowedActions`
- optional latest operator action summary for quick rendering

Full operator action history should be read through a dedicated route rather than embedding the entire command history into every task list response.

### Persistence And Replay
The current persistence design already reserves `operator_actions` and operator-action event types. This phase should activate that design rather than invent a parallel storage path.

Each operator command produces two layers of record:

1. operator command audit events, such as:
   - `operator_action.requested`
   - `operator_action.applied`
   - `operator_action.rejected`
2. task business events that represent the actual state mutation, such as:
   - `task.operator_recovered`
   - `task.operator_takeover_submitted`
   - `task.operator_abandoned`

Business events remain the authoritative replay source. Operator action audit records support explanation, UI history, and future multi-operator evolution.

## Workflow Semantics
### Recover
`recover` is the narrow recovery path for tasks that should keep running without changing task intent.

It is valid only when the task is:

- `failed`, or
- marked `recovery_required`

Its semantics are:

- require an operator note
- preserve the existing task identity, prompt, and governance outcome
- clear `recoveryState` back to `healthy`
- append explicit history explaining that the task was operator-recovered
- re-enter the workflow at `dispatching`

`recover` is intentionally not a replay mutation tool. It does not edit prior artifacts, does not rewrite governance state, and does not re-enter `planning`.

### Takeover
`takeover` is the human-guided restart path for tasks that need new instruction but should keep the same task identity.

It is valid only when the task is:

- `failed`
- `awaiting_approval`, or
- marked `recovery_required`

Its semantics are:

- require an operator note
- preserve the original task identity
- append the operator note into task history so replay explains why the branch happened
- clear any current actionable approval gate from the task projection
- re-enter the workflow at `planning`
- force the task through the normal `planning -> review -> approval? -> dispatch -> execution` path again

This makes `takeover` clearly different from `recover`:

- `recover` resumes the existing task path
- `takeover` creates a new planning branch inside the same task record

### Abandon
`abandon` is the explicit human stop action for tasks that should not continue.

It is valid for any non-terminal actionable task except:

- `completed`
- `partial_success`
- `rejected`
- `rolled_back`
- `abandoned`

Its semantics are:

- require an operator note
- require explicit confirmation
- clear any remaining actionable controls from the task projection
- transition the task to `abandoned`
- preserve prior replay, run, and artifact history for audit

`abandon` does not imply rollback. It is an operator closure decision.

## State Machine Changes
The task state machine remains explicit and deterministic. This phase adds one new terminal node and three operator-triggered transitions:

- `failed -> dispatching` through `task.operator_recovered`
- `failed -> planning` through `task.operator_takeover_submitted`
- `awaiting_approval -> planning` through `task.operator_takeover_submitted`
- ambiguous `recovery_required` projections may be moved to `dispatching` through `task.operator_recovered`
- ambiguous `recovery_required` projections may be moved to `planning` through `task.operator_takeover_submitted`
- `intake | planning | review | needs_revision | awaiting_approval | dispatching | executing | verifying | failed -> abandoned` through `task.operator_abandoned`

The deterministic rule is that operator commands must still end in legal task statuses. Recovery markers are projection metadata, not a second status graph.

## API Plan
### Write Routes
This phase adds a dedicated operator command route family:

- `POST /api/tasks/:taskId/operator-actions/recover`
- `POST /api/tasks/:taskId/operator-actions/takeover`
- `POST /api/tasks/:taskId/operator-actions/abandon`

Request bodies:

- `recover`: `{ note }`
- `takeover`: `{ note }`
- `abandon`: `{ note, confirm: true }`

Successful responses should follow the existing pattern and return the updated task projection.

### Read Routes
This phase also adds dedicated operator reads:

- `GET /api/tasks/:taskId/operator-actions`
- `GET /api/operator-actions/summary`

`GET /api/tasks/:taskId/operator-actions` returns the operator command history for the task.

`GET /api/operator-actions/summary` returns a compact top-level summary that supports an operator queue, including counts and the tasks currently needing operator attention.

### Validation Rules
The API should reject unsupported or incomplete actions explicitly:

- missing or blank `note` returns `400`
- `abandon` without `confirm: true` returns `400`
- unknown task returns `404`
- command not allowed for the current task state returns `409`

The API should validate operator actions against explicit operator rules rather than overloading `governance.allowedActions`.

## Web Console Plan
### Governance Inbox Stays Focused
The existing governance inbox should remain responsible only for governance actions:

- `approve`
- `reject`
- `revise`

It should not become a mixed surface for recovery and operator intervention.

### New Operator Queue
The web console should add a new operator queue panel for fast triage. This panel is intentionally narrow:

- show tasks needing operator attention
- prioritize `recovery_required` tasks first
- include failed tasks that expose operator actions
- link the user into task detail rather than duplicating the full command form

The queue is for discovery, not full command execution.

### Task Detail Operator Panel
Task detail becomes the authoritative operator action surface. It should add an `Operator Console` panel that shows:

- `recoveryState`
- `recoveryReason`
- `operatorAllowedActions`
- note entry for `recover` and `takeover`
- note entry plus explicit confirmation UI for `abandon`
- recent operator actions alongside governance and timeline context

This keeps all decision-making in the same place where the user can also read replay, diffs, artifacts, and current task status.

## Error Handling
This phase adds only operator-specific error paths:

- invalid operator commands return `409`
- incomplete operator input returns `400`
- `takeover` from `awaiting_approval` must clear stale approval request state instead of leaving the UI in an inconsistent mixed state
- `recover` must not silently rewrite governance decisions or prompt text
- `abandon` must render clearly as operator closure, not as generic task failure

The phase does not add automatic resume of ambiguous in-flight work. Restart ambiguity continues to surface as `recovery_required` until a human decides how to proceed.

## Testing Strategy
The implementation should add five layers of verification:

1. contract and state-machine tests for `abandoned`, new operator action schemas, and legal transition rules
2. control-plane service tests for `recover`, `takeover`, and `abandon` validation and resulting task mutations
3. route tests for new operator endpoints and `400 / 404 / 409` behavior
4. persistence and projection tests proving operator actions survive projection rebuild and replay remains explanatory
5. web and browser tests covering operator queue rendering, task detail operator actions, and one end-to-end recovery flow

The minimum browser path should cover one realistic operator intervention:

1. load a task that requires operator attention
2. inspect its task detail context
3. issue either `recover` or `takeover`
4. observe the updated task state and audit surfaces

## Implementation Slices
The implementation should be delivered in three slices:

1. domain and backend command path
   - contracts
   - state machine changes
   - control-plane service branches
   - operator routes
   - persistence and projection updates
2. web operator console
   - API client additions
   - operator queue panel
   - task detail operator panel
   - loading, pending, and error states
3. replay and audit polish
   - operator action history rendering
   - queue summaries and badges
   - rebuild and replay coverage
   - end-to-end scenario coverage

## Non-Goals
This phase does not implement:

- multi-operator workflows or RBAC
- arbitrary free-form commands to agents
- bulk operator actions
- a new task attempt model
- deep compensation or rollback orchestration
- inline replay mutation tools
- generalized policy services beyond the existing governance layer

## Success Criteria
This phase is successful if:

- the web console can distinguish governance actions from recovery actions
- an operator can recover a failed or ambiguous task without changing task intent
- an operator can take over a task and re-enter planning with a preserved audit trail
- an operator can intentionally end a task through `abandoned`
- replay and projection rebuild still explain what happened after operator intervention
- all operator writes remain routed through the `control-plane`
