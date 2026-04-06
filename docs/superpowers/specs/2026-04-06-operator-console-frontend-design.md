# Codex Feudal Cluster Operator Console Frontend Design

## Overview
`M1 Operator Backend` already provides the authoritative contracts, routes, and service semantics for `recover`, `takeover`, and `abandon`. The next milestone is a focused web-console integration: `M2 Operator Console Frontend`.

This phase keeps the existing single-page console intact and adds operator recovery as an incremental extension rather than introducing a new route, page, or top-level navigation entry. The goal is to let an operator discover tasks that need attention, inspect their current context, and execute backend-supported recovery actions from the existing task workspace.

## Scope
This phase delivers one coherent frontend milestone where:

1. the existing console renders an operator queue inside the current page layout
2. task detail renders an operator command surface for the currently selected task
3. the web app consumes backend operator summary, task operator history, and operator action endpoints
4. operator actions reuse the current `App`-level orchestration pattern for loading, mutation, and error display
5. queue state, detail state, and existing replay panels converge after operator actions without a full page reload

This phase does not include:

- a new standalone operator page
- a new navigation item
- a client-side data library migration
- RBAC, multi-operator locking, or presence indicators
- browser e2e infrastructure beyond the current Vitest + RTL test stack

## Chosen Architecture
### Incremental Single-Page Integration
The web console already treats `App` as the page-level orchestrator for task loading, selection, governance actions, replay data, and agent registry data. This phase extends that pattern instead of introducing a route-level split or a new global state layer.

The UI remains a single console page with two new operator-specific surfaces:

- `OperatorQueuePanel` for discovery and triage
- `OperatorConsolePanel` inside task detail for execution

This keeps operator work inside the same context as artifacts, timeline, governance, replay, and diffs.

### Queue For Discovery, Detail For Execution
The operator queue is intentionally narrow. It exists to answer "which tasks currently need operator attention?" It does not duplicate the full command form or detailed task context.

Task detail remains the authoritative execution surface because the operator should be able to review:

- current task status
- recovery metadata
- approval state
- artifacts
- history
- diffs

before issuing `recover`, `takeover`, or `abandon`.

### `App` Remains The Mutation Owner
Child panels continue to emit user intent while `App` owns network operations and state updates. This matches the existing governance flow and avoids introducing a second mutation model midstream.

## UI Composition
### `OperatorQueuePanel`
`OperatorQueuePanel` is added as a new panel within the existing console grid. It receives:

- `operatorSummary`
- `selectedTaskId`
- `onSelectTask(taskId)`
- loading and empty-state flags

Each row shows:

- task title
- current task status
- `recoveryState`
- optional `recoveryReason`
- operator action badges from `operatorAllowedActions`

The queue does not render action buttons. Selecting a row moves the user into the existing task detail panel and triggers operator-history loading for that task if needed.

### `TaskDetailPanel` With Embedded `OperatorConsolePanel`
`TaskDetailPanel` keeps its current role and gains one embedded subpanel:

- `OperatorConsolePanel`

The insertion point is after `Approval Gate` and before `GovernancePanel`. This placement makes the boundary explicit:

- approval remains governance
- operator actions remain operational recovery

but both remain visible in the same task workspace.

`OperatorConsolePanel` renders:

- current `recoveryState`
- optional `recoveryReason`
- current `operatorAllowedActions`
- one operator note input bound to the selected task
- explicit `abandon` confirmation control
- per-task action pending state
- per-task inline action error
- operator action history for the selected task

If the selected task has no operator relevance, the panel may either render a compact empty state or remain hidden. The chosen implementation should prefer a compact empty state so the layout does not jump as selection changes.

## Data Flow And State
### App-Level State Additions
`App` adds the minimum state needed to support operator work while preserving the current orchestration pattern:

- `operatorSummary`
- `operatorHistoryByTaskId`
- `operatorDraftsByTaskId`
- `operatorAbandonConfirmByTaskId`
- `activeOperatorAction`
- `operatorErrorByTaskId`

The separation rules are:

- `tasks` remains the authoritative task-detail source
- `operatorSummary` is only a compact discovery list
- `operatorHistoryByTaskId` is cached per task and loaded lazily

This avoids treating the summary response as a second source of full task truth.

### Initial Load
Initial page load becomes a four-request bootstrap:

1. `fetchTasks()`
2. `fetchAgents()`
3. `fetchRecoverySummary()`
4. `fetchOperatorActionSummary()`

The first selected task still drives the initial events and diffs fetch. Operator history is not preloaded for every task.

### Lazy Loading Rules
Operator history is fetched when:

- the selected task exposes `operatorAllowedActions`, or
- the task was selected from the operator queue and no cached history exists yet

This keeps the queue lightweight while still ensuring detail context becomes complete on demand.

## API Client Plan
`apps/web/src/lib/api.ts` gains typed helpers that directly mirror the backend routes introduced in `M1`:

- `fetchOperatorActionSummary()`
- `fetchTaskOperatorActions(taskId)`
- `recoverTask(taskId, note)`
- `takeoverTask(taskId, note)`
- `abandonTask(taskId, note, confirm)`

The web app should reuse shared contracts from `@feudal/contracts` for:

- `OperatorActionSummary`
- `OperatorActionRecord`
- `OperatorActionType`
- `OperatorActionRequest`

The web package should not redefine these payloads locally.

### Error Message Handling
The common JSON request helper should preserve backend `message` payloads when present. This is necessary because operator routes intentionally distinguish:

- `400` invalid request body
- `404` task not found
- `409` action not allowed

The UI needs those messages for actionable inline feedback.

## Mutation And Refresh Strategy
### Operator Action Submission
All operator actions follow the same top-level flow:

1. validate local input
2. mark `{ taskId, actionType }` as pending
3. call the specific operator endpoint
4. upsert the returned task into `tasks`
5. keep the task selected
6. clear the draft and confirmation state for that task on success
7. asynchronously refresh dependent read models

### Dependent Refreshes
After a successful operator action, the app refreshes:

- `operatorSummary`
- `recoverySummary`
- task events for the acted-on task
- task diffs for the acted-on task
- operator history for the acted-on task

The returned task projection is applied immediately before these follow-up reads complete. If a follow-up read fails, the app keeps the successful task mutation visible and surfaces an error rather than rolling back to stale state.

### Queue And Detail Consistency
The consistency contract is:

- action endpoint response updates the selected task immediately
- follow-up refreshes reconcile queue counts, recovery counters, and history
- queue and detail should converge without a hard reload

If a queue-selected task is not currently present in `tasks`, `App` first refreshes the task list. If the task still cannot be found, the UI surfaces a task-missing error instead of silently clearing the selection.

## Validation And Error Handling
Frontend validation intentionally stays narrow and mirrors backend rules:

- `recover` requires a non-empty note
- `takeover` requires a non-empty note
- `abandon` requires a non-empty note
- `abandon` also requires explicit confirmation

Error presentation uses two layers:

- global banner for bootstrap and broad data-loading failures
- inline operator-panel error for task-specific action failures

Only one operator action may be pending per task at a time. Repeated clicks should be disabled until the current request settles.

## Testing Strategy
This milestone extends the existing Vitest + React Testing Library stack and does not add a new browser test framework.

### Component Tests
Add focused tests for:

- `OperatorQueuePanel` empty, populated, and selected states
- queue badges and recovery-reason rendering
- `OperatorConsolePanel` note validation
- `OperatorConsolePanel` abandon confirmation behavior
- history rendering and inline error rendering

### App Integration Tests
Extend `apps/web/src/app.test.tsx` to cover:

- initial load requesting operator summary
- selecting a task from the operator queue
- lazy loading operator history for the selected task
- successful `recover`, `takeover`, and `abandon` flows
- backend `409` rendering inline operator errors without corrupting local task state
- refresh-after-mutation behavior for summary and recovery counters

### Build Verification
As with other web-console changes, this milestone is not considered complete until both pass:

- `pnpm test`
- `pnpm build`

## File-Level Change Plan
The expected implementation footprint is intentionally narrow:

- `apps/web/src/app.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/app.test.tsx`
- new `apps/web/src/components/operator-queue-panel.tsx`
- new `apps/web/src/components/operator-console-panel.tsx`
- targeted updates in `apps/web/src/components/task-detail-panel.tsx`
- targeted style additions in `apps/web/src/styles.css`

No changes are required to route structure or page composition outside the existing console page.

## Risks And Constraints
The main technical trade-off is that `App` becomes somewhat larger because it continues to own page-wide orchestration. That is acceptable for this milestone because:

- it matches the current architecture
- it minimizes moving parts
- it avoids mixing a feature delivery milestone with a broader client-state refactor

The main correctness risk is divergence between summary data and task-detail data. The design addresses that by making `tasks` authoritative for detail, using summary only for discovery, and forcing post-mutation refreshes of both summary surfaces.

## Acceptance Criteria
This milestone is complete when:

1. the existing console renders an operator queue without adding a new page or nav item
2. selecting an operator-queued task reveals operator controls in task detail
3. `recover`, `takeover`, and `abandon` can be triggered from the web console against the `M1` backend routes
4. operator history is visible in task detail
5. queue state, recovery summary, and task detail converge after an operator action
6. the web test suite and production build both pass
