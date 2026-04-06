# Codex Feudal Cluster Operator Recovery Backend Design

## Overview
The current codebase can detect restart ambiguity, replay historical task state, and expose governance actions, but it still lacks an authoritative recovery loop for tasks that are failed, stuck, or ambiguous after restart. The broader operator-console design already defines `recover`, `takeover`, and `abandon`, but the current implementation stops before the backend semantics needed to make those actions real.

This phase scopes that work down to one backend milestone: `M1 Operator Backend`. It delivers the contracts, state-machine transitions, control-plane service behavior, persistence rules, and HTTP endpoints required for operator recovery actions. It does not include the web operator queue or task-detail operator UI. The goal is to make the backend authoritative first so later UI work can consume a stable and auditable surface.

## Scope
This phase delivers one coherent operator-recovery backend where:

1. task contracts expose explicit operator action types, records, summaries, and allowed actions
2. the deterministic task state machine supports operator-triggered recovery transitions
3. `control-plane` accepts `recover`, `takeover`, and `abandon` as first-class write commands
4. task projections expose `operatorAllowedActions` without overloading governance actions
5. operator action history and summary reads are available through dedicated backend endpoints
6. replay and projection rebuild continue to explain task state deterministically after restart

This phase does not include:

- web operator queue or operator console rendering
- RBAC or multi-operator coordination
- arbitrary operator free-form task commands
- a new attempt model
- compensation or rollback orchestration
- fixes to real-worker prompt fidelity in `acp-gateway`

## Chosen Architecture
### Separate Operator Domain
Operator recovery actions remain separate from governance actions.

- governance continues to answer whether a task may proceed through `approve`, `reject`, and `revise`
- operator recovery answers how a failed or ambiguous task should proceed through `recover`, `takeover`, and `abandon`

This separation must exist in contracts, policy derivation, service methods, routes, and persistence records. The implementation must not extend `TaskAction` or `governance.allowedActions` with operator actions because that would collapse two distinct control concepts into one surface.

### Single Authoritative Task Engine
`OrchestratorService` remains the only authoritative task coordinator. This phase extends it with operator command methods rather than introducing a parallel recovery engine. Task state still changes only through legal state-machine transitions derived from task events. Projection rows remain derived state, not a mutable source of truth.

### Two-Layer Audit Model
Each accepted operator command produces two kinds of backend record:

1. task business events in the task event stream, which are the authoritative replay source
2. operator action audit rows in `operator_actions`, which explain the human command that caused the transition

The division is intentional:

- task replay answers "what state did the task enter and why"
- operator history answers "which operator command was requested, applied, or rejected"

## Data Model
### Task Status
`TaskStatus` gains a new terminal status:

- `abandoned`

`abandoned` means a human operator intentionally stopped the task and chose not to continue it. It is distinct from:

- `rejected`, which remains a governance outcome
- `failed`, which remains an execution or verification failure that can still be recoverable
- `rolled_back`, which remains reserved for compensation semantics

### Operator Contracts
The shared contracts package adds:

- `OperatorActionType = recover | takeover | abandon`
- `OperatorActionStatus = requested | applied | rejected`
- `OperatorActionRequest`
- `OperatorActionRecord`
- `OperatorActionSummary`

`TaskRecord` gains:

- `operatorAllowedActions: OperatorActionType[]`

`OperatorActionRecord` must contain enough data to explain an operator command end to end:

- unique record id
- task id
- action type
- action status
- operator note
- actor type
- optional actor id
- `createdAt`
- optional `appliedAt`
- optional `rejectedAt`
- optional `rejectionReason`

### Projection Semantics
Task projections returned by `control-plane` expose:

- existing `recoveryState`
- existing `recoveryReason`
- new `operatorAllowedActions`

The projection does not embed full operator history inline. Full history is read through a dedicated route so task list responses remain compact.

## Operator Action Rules
### Recover
`recover` is the narrow resume path.

Allowed when:

- task status is `failed`, or
- task projection is marked `recovery_required` because restart left an in-flight task ambiguous

Effects:

- requires a non-empty note
- preserves task id, prompt, and governance outcome
- clears `recoveryState` back to `healthy`
- clears `recoveryReason`
- appends a task history entry explaining operator recovery
- transitions the task back to `dispatching`
- continues the existing workflow from dispatch using the current task intent and governance outcome until the next stable pause or terminal state

`recover` does not return to planning and does not rewrite prior approval or review outcomes.

### Takeover
`takeover` is the guided restart path within the same task id.

Allowed when:

- task status is `failed`
- task status is `awaiting_approval`, or
- task projection is marked `recovery_required` because restart left an in-flight task ambiguous

Effects:

- requires a non-empty note
- appends an operator note to task history
- clears any active `approvalRequest`
- clears stale governance actions derived from `awaiting_approval`
- preserves the original task id
- transitions the task to `planning`
- continues the normal `planning -> review -> approval? -> dispatch -> execution -> verification` workflow until the next stable pause or terminal state

`takeover` is therefore a synchronous backend restart of the task workflow, even though this milestone does not yet add the dedicated web operator UI for triggering it.

### Abandon
`abandon` is the explicit stop path.

Allowed when the task is actionable and not already terminal. It must reject:

- `completed`
- `partial_success`
- `rejected`
- `rolled_back`
- `abandoned`

Effects:

- requires a non-empty note
- requires `confirm: true`
- appends an operator note to task history
- clears any remaining operator action availability
- transitions the task to `abandoned`

`abandon` does not imply rollback and must remain clearly distinct from generic task failure.

## State Machine Changes
The deterministic state machine adds one terminal node and three operator-triggered events:

- `task.operator_recovered`
- `task.operator_takeover_submitted`
- `task.operator_abandoned`

Legal transitions are:

- `failed -> dispatching` through `task.operator_recovered`
- `intake | planning | review | dispatching | executing | verifying -> dispatching` through `task.operator_recovered`
- `failed -> planning` through `task.operator_takeover_submitted`
- `awaiting_approval -> planning` through `task.operator_takeover_submitted`
- `intake | planning | review | dispatching | executing | verifying -> planning` through `task.operator_takeover_submitted`
- `intake | planning | review | needs_revision | awaiting_approval | dispatching | executing | verifying | failed -> abandoned` through `task.operator_abandoned`

`recovery_required` remains projection metadata rather than a status node. The state machine still needs these in-flight transitions so the service can apply a legal event to a rebuilt task whose status is still `planning`, `dispatching`, or another interrupted mid-flight state. Route and service policy continue to restrict those transitions to tasks whose projection actually requires recovery.

## Control-Plane Design
### Operator Policy Layer
`control-plane` adds `operator-actions/policy.ts` to derive `operatorAllowedActions` from `status` and `recoveryState`.

The policy rules are explicit:

- `recover` when `status === failed` or `recoveryState === recovery_required`
- `takeover` when `status === failed`, `status === awaiting_approval`, or `recoveryState === recovery_required`
- `abandon` for non-terminal actionable tasks

Projection rebuild should mark stable human-waiting states as healthy rather than ambiguous. In particular, `awaiting_approval` and `needs_revision` remain healthy across rebuild because they are already paused on an explicit human action rather than an interrupted in-flight workflow step.

Governance policy and operator policy remain separate modules so each domain owns its own human action derivation.

### Orchestrator Service Methods
`OrchestratorService` gains:

- `recoverTask(taskId, note)`
- `takeoverTask(taskId, note)`
- `abandonTask(taskId, note, confirm)`
- `listOperatorActions(taskId)`
- `getOperatorActionSummary()`

These methods follow the same enforcement pattern as the existing governance action methods:

1. load the task
2. validate existence
3. validate command availability
4. mutate a task snapshot through legal workflow semantics
5. continue from `planning` or `dispatching` through the existing synchronous coordinator steps until the next stable pause or terminal state
6. persist business events and operator audit records
7. return the updated projection

Command-not-allowed conditions remain `409` responses through the route layer.

## Persistence And Replay
### Task Event Stream
Task state changes continue to append to the task event stream. The event type naming should remain business-oriented:

- `task.operator_recovered`
- `task.operator_takeover_submitted`
- `task.operator_abandoned`

These events are the authoritative source for replaying a task snapshot.

### Operator Audit Table
`operator_actions` must stop being used for governance actions. After this phase it stores only operator recovery actions.

Each row records:

- task id
- action type
- status
- actor information
- optional rejection reason
- payload JSON containing the operator note and any command metadata
- timestamps

### Projection Rebuild
Projection rebuild remains task-stream-first:

- rebuild task snapshots from task events
- recompute `recoveryState`
- recompute `operatorAllowedActions` from operator policy

Rebuild should only mark truly interrupted in-flight states as `recovery_required`. Stable paused states such as `awaiting_approval` and `needs_revision` should rebuild as `healthy`.

Operator history is not rebuilt from task snapshots. It is loaded from `operator_actions` reads. This keeps the recovery queue and task detail history explainable without turning task snapshots into a giant embedded audit blob.

### Diff Tracking
`task-event-codec` extends tracked fields to include:

- `operatorAllowedActions`

This ensures task diffs explain when recovery actions appeared or disappeared over time.

## API Plan
### Write Routes
`control-plane` adds:

- `POST /api/tasks/:taskId/operator-actions/recover`
- `POST /api/tasks/:taskId/operator-actions/takeover`
- `POST /api/tasks/:taskId/operator-actions/abandon`

Request bodies:

- `recover`: `{ note }`
- `takeover`: `{ note }`
- `abandon`: `{ note, confirm: true }`

Successful responses return the updated task projection.

### Read Routes
`control-plane` adds:

- `GET /api/tasks/:taskId/operator-actions`
- `GET /api/operator-actions/summary`

`GET /api/tasks/:taskId/operator-actions` returns the operator history for one task.

`GET /api/operator-actions/summary` returns a compact queue-oriented summary with:

- `tasksNeedingOperatorAttention`
- a list of tasks currently exposing non-empty `operatorAllowedActions`

### Validation Rules
The route layer enforces:

- blank or missing `note` returns `400`
- `abandon` without `confirm: true` returns `400`
- missing task returns `404`
- command not currently allowed returns `409`

## Error Handling
This phase adds only operator-specific failure paths:

- unsupported operator actions return `409`
- incomplete command payloads return `400`
- `takeover` from `awaiting_approval` must not leave a stale `approvalRequest`
- `recover` must not rewrite prompt text or governance decisions
- `abandon` must surface as explicit operator closure rather than generic task failure

This phase does not attempt automatic resume of ambiguous in-flight ACP work. Ambiguous restarts still surface as `recovery_required` until an operator chooses a recovery path.

## Testing Strategy
This backend phase adds four verification layers:

1. contracts and task-machine tests for `abandoned`, operator schemas, and legal transitions
2. operator policy and orchestrator service tests for command availability and resulting task mutations
3. route tests for success cases plus `400`, `404`, and `409`
4. persistence and rebuild tests for operator history, operator summary, projection rebuild, and replay-visible diffs

The backend milestone is complete when:

- all new operator actions are available through contracts and API routes
- legal transitions are enforced deterministically
- operator audit records survive persistence reads
- projection rebuild still yields correct recovery metadata and operator action availability
- existing governance behavior remains unchanged

## Risks And Follow-On Work
The main intentional limitation of this phase is that `takeover` returns the task to `planning` but this milestone does not yet build the front-end controls for operators to drive that path visually. That is acceptable because the backend contract becomes available first and can be exercised through tests and API clients.

The next milestone should build the web operator queue and task-detail operator panel on top of these backend contracts without redefining the semantics introduced here.
