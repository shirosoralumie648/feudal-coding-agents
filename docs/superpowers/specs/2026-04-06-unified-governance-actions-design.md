# Codex Feudal Cluster Unified Governance Actions Design

## Overview
The current governance workflow already computes `task.governance.allowedActions`, but the control-plane and web console still submit governance commands through three hard-coded branches: `approve`, `reject`, and `revise`. That leaves the UI only partially dynamic, duplicates validation logic across routes and client helpers, and makes every future governance action a multi-file refactor.

This milestone unifies governance action submission without redefining the existing governance semantics. The system keeps the same three actions and the same task-state outcomes, but it introduces one canonical governance command route and one canonical service entry point. The web console then renders and submits governance actions from the advertised action sets rather than assuming only `approve` and `reject` exist.

The design intentionally stays narrower than a full governance command subsystem. It does not add new governance history tables, new action types, or ACP protocol changes. The goal is to make the existing governance loop internally consistent and extension-ready.

## Scope
This milestone delivers one coherent governance action loop where:

1. the control-plane exposes a unified write route for governance actions
2. the web console submits `approve`, `reject`, and `revise` through that unified route
3. `Governance Inbox` renders available actions from `task.governance.allowedActions` instead of hard-coded button assumptions
4. `revise` uses the same unified submission path while still collecting a required note in task detail
5. the legacy `/approve`, `/reject`, and `/revise` routes remain available as compatibility wrappers
6. governance action drift between `task.governance.allowedActions` and `task.approvalRequest.actions` is surfaced explicitly rather than silently ignored

## Chosen Architecture
### Unified Governance Command Route With Compatibility Wrappers
The control-plane should add a single route family:

- `POST /api/tasks/:taskId/governance-actions/:actionType`

`actionType` is validated against the existing `TaskAction` contract:

- `approve`
- `reject`
- `revise`

Request body:

- `approve`: `{ note?: string }`
- `reject`: `{ note?: string }`
- `revise`: `{ note: string }`

The old route family remains:

- `POST /api/tasks/:taskId/approve`
- `POST /api/tasks/:taskId/reject`
- `POST /api/tasks/:taskId/revise`

Those routes should become thin adapters that forward into the same service-level governance action dispatcher. This keeps compatibility for existing callers and tests while establishing one canonical command path for all new UI work.

### One Canonical Service Entry Point
`OrchestratorService` should grow one primary governance command API:

- `submitGovernanceAction(taskId, actionType, note?)`

Internally:

- `approve` reuses the current approval consumption path
- `reject` reuses the current rejection consumption path
- `revise` reuses the current revision re-entry path

The existing `approveTask`, `rejectTask`, and `submitRevision` methods may remain for compatibility, but they should delegate into the canonical dispatcher rather than owning separate validation and branching logic.

This keeps the business rules centralized:

- task existence checks
- `allowedActions` validation
- note normalization
- approval gate response rules
- state transitions

### Action Consistency Rules
The design keeps two action sources but gives them distinct roles:

- `task.governance.allowedActions` is the control-plane's task-level governance truth
- `task.approvalRequest.actions` is the ACP await-gate action advertisement for approval tasks

They should agree whenever the task is at an approval gate. To keep drift visible and safe:

1. the backend validates `approve` and `reject` against both the governance action set and the current approval request when `status === "awaiting_approval"`
2. the frontend cross-checks both sets before rendering active approval buttons
3. when they disagree, the frontend shows an explicit mismatch warning and disables risky direct submission

This gives the UI a safe degradation path while also making semantic drift observable during development.

## API Plan
### Unified Route
Add:

- `POST /api/tasks/:taskId/governance-actions/:actionType`

Behavior:

- returns `200` with the updated task projection on success
- returns `400` when `actionType === "revise"` and `note` is missing or blank
- returns `404` when the task does not exist
- returns `409` when the action is not currently allowed or the approval gate action set is inconsistent with the requested action

### Compatibility Routes
The existing routes stay callable, but their behavior becomes:

- `/approve` => `submitGovernanceAction(taskId, "approve")`
- `/reject` => `submitGovernanceAction(taskId, "reject")`
- `/revise` => `submitGovernanceAction(taskId, "revise", note)`

This preserves compatibility without leaving route-level governance logic duplicated forever.

## Web Console Plan
### Governance Inbox
`Governance Inbox` keeps its current place in the console and remains focused on governance work only.

Rendering rules:

- iterate over `task.governance.allowedActions`
- render direct buttons only for actions that do not require extra input
- keep `revise` discoverable, but continue routing note entry through task detail instead of an inbox inline form
- continue showing approval prompt context when `approvalRequest` exists

If the task is in `awaiting_approval` and the governance action set disagrees with the approval request action set, the inbox should:

- show a visible mismatch warning
- not render actionable `approve` or `reject` buttons for that task

### Task Detail Revision Flow
`TaskDetailPanel` remains the authoritative input surface for `revise`.

Changes:

- `RevisionPanel` visibility still depends on `allowedActions.includes("revise")`
- submit through the unified governance action client instead of a dedicated revise-only client helper
- clear the note on success

### Shared Governance Submission State
`App` should collapse its separate approve/reject/revise submission branches into one governance action handler. That shared handler owns:

- pending state
- error handling
- task refresh behavior
- optimistic selection retention

This keeps governance action plumbing aligned with the unified backend route.

## Error Handling
This milestone adds only governance-action-specific error behavior:

- unsupported governance actions return `409`
- `revise` without a note returns `400`
- missing tasks return `404`
- approval-gate action drift returns `409` from the backend and an explicit mismatch warning in the frontend

The frontend should not silently pick one action source when the two sources disagree. Failing closed is safer than submitting the wrong governance command.

## Testing Strategy
The implementation should add five verification layers:

1. control-plane service tests proving `submitGovernanceAction()` drives `approve`, `reject`, and `revise` through the same dispatcher while preserving current workflow outcomes
2. route tests covering the unified governance route plus compatibility coverage for legacy endpoints
3. web API client tests covering the unified route path and request body semantics
4. React tests covering dynamic inbox rendering, unified revise submission, and governance action mismatch degradation
5. browser tests ensuring the existing revision loop still passes through the unified governance action path without user-visible regression

## Non-Goals
This milestone does not implement:

- new governance action types beyond `approve`, `reject`, and `revise`
- a governance action history table or separate audit surface
- ACP protocol redesign
- operator/governance action unification
- RBAC or multi-user governance workflows
- new policy dimensions such as budget, security, or compliance services

## Success Criteria
This milestone is successful if:

- the web console no longer depends on hard-coded `approve` / `reject` submission paths as its primary governance model
- one unified control-plane route can execute all current governance actions
- the legacy governance endpoints remain compatible
- `revise` still requires a note and still re-enters the workflow correctly
- mismatches between governance and approval action sets are surfaced explicitly and handled safely
- `pnpm test`, `pnpm build`, and `pnpm --filter @feudal/web exec playwright test` all pass after the migration
