# Codex Feudal Cluster Phase 3-1 Design

## Overview
Phase 3-1 introduces a durable data plane for the existing single-machine Codex cluster. Phase 2 proved the real collaboration loop with ACP, a local gateway, and visible approvals. That loop is still fragile because task truth and ACP run truth are kept in memory. A restart loses context, replay is incomplete, and future operator tooling would have no trustworthy audit base.

This phase adds three foundations:

- Postgres-backed persistence for task and ACP run state
- append-only audit logging with immutable event history
- a read-only replay surface that can explain how a task reached its current state

This phase does not yet implement operator write actions, formal login, or RBAC enforcement. Those later features are explicitly anticipated by the storage and event model designed here.

## Scope
The goal is to deliver one durable local deployment where:

1. `control-plane` and `acp-gateway` write durable records to Postgres
2. every meaningful business change produces immutable audit events
3. current task and run state remain queryable through projection tables
4. restart recovery can rehydrate state and mark ambiguous in-flight work
5. the web console can inspect event history, diffs, and point-in-time replay views

The system remains single-user, single-repository, and single-machine in its operational target, even though the data model reserves actor fields for later authenticated multi-operator use.

## Chosen Architecture
### Event Store And Projections
The system uses event sourcing for truth and projections for query speed:

- `event_log` is the only append-only source of historical truth
- projection tables provide current snapshots for APIs and UI
- `projection_checkpoint` tracks replay progress per projection consumer

This keeps audit semantics strong without forcing all read paths to replay the full history.

### Authority Boundaries
`control-plane` remains the authoritative business entry point. Task lifecycle changes, approval changes, replay reads, and future operator commands flow through it.

`acp-gateway` remains the ACP execution boundary. It owns ACP run lifecycle facts and worker execution facts, but those facts are now persisted rather than treated as disposable memory.

`web` and the future operator console remain read-only clients in this phase. They consume projections and replay endpoints but do not mutate storage directly.

## Data Model
### Append-Only Event Tables
`event_log` is the canonical store. Each row includes:

- `id`
- `stream_type` such as `task`, `run`, `artifact`, or `operator-action`
- `stream_id`
- `event_type`
- `event_version`
- `occurred_at`
- `actor_id`
- `actor_type`
- `reason`
- `correlation_id`
- `causation_id`
- `payload_json`
- `metadata_json`

Constraints:

- inserts only
- no updates or deletes
- unique `(stream_type, stream_id, event_version)`
- payloads must preserve sufficient business fact to replay without external patch-up

`projection_checkpoint` stores:

- `projection_name`
- `last_event_id`
- `updated_at`

### Projection Tables
The first projection set is:

- `tasks_current`
- `task_history_entries`
- `runs_current`
- `artifacts_current`
- `operator_actions`

`tasks_current` and `runs_current` both include:

- `recovery_state` as `healthy`, `replaying`, or `recovery_required`
- `recovery_reason`
- `last_recovered_at`

The recovery model treats `task` as the aggregate root and `run` as a subordinate stream linked to the task, rather than flattening all run detail into the task stream.

## Event Strategy
### Dual-Layer Events
Every meaningful state change writes:

1. a coarse business event
2. a field-level diff event when the current projection changed

Business events remain the authoritative replay source. Diff events support operator audit and replay inspection, but do not replace business events as truth.

Examples of business events:

- `task.created`
- `task.status_transitioned`
- `task.approval_requested`
- `task.approval_resolved`
- `task.run_linked`
- `run.created`
- `run.status_transitioned`
- `run.awaiting_entered`
- `run.awaiting_resumed`
- `artifact.recorded`
- `operator_action.requested`
- `operator_action.applied`
- `operator_action.rejected`

Examples of diff events:

- `task.diff_recorded`
- `run.diff_recorded`
- `artifact.diff_recorded`
- `operator_action.diff_recorded`

Diff payloads use a JSON Patch-style structure with:

- `target_type`
- `target_id`
- `before_subset_json`
- `after_subset_json`
- `patch_json`
- `changed_paths`

Artifact diffs stay index-oriented in this phase. Deep artifact content diffs are intentionally deferred to avoid event bloat.

### Write Path Rule
Every successful write transaction follows one order:

1. validate command and current state
2. derive business event
3. derive diff event if projection changes
4. append events and update projections in one database transaction
5. advance projection checkpoint
6. return success only after commit

## Recovery Model
The system uses incremental projection replay with full rebuild fallback.

Normal startup behavior:

- continue from `projection_checkpoint` when checkpoints are valid and contiguous
- rebuild projections from the event log when checkpoints are missing, incompatible, or clearly broken

Automatic recovery rules:

- terminal tasks and runs recover automatically
- `awaiting_approval` recovers automatically and remains actionable
- active work in `dispatching`, `executing`, or `verifying` does not auto-resume
- those ambiguous in-flight records are marked `recovery_required` for future manual handling

This is intentionally conservative. After a process crash, silent auto-resume is riskier than surfacing uncertainty explicitly.

## Replay UI Read Model
Phase 3-1 ships a read-only replay experience, not a full operator console.

The replay surface exposes five views:

- `Current Snapshot`
- `Timeline`
- `Runs`
- `Artifacts`
- `Diff Inspector`

Latest-state pages read projection tables directly. Point-in-time replay is exposed by:

- `GET /api/tasks/:taskId/replay?asOfEventId=...`

This endpoint reconstructs task state at a selected event boundary on demand, instead of maintaining precomputed snapshots for every event.

## API Plan
### Existing APIs Stay Stable
These paths remain and continue to serve the current UI and Phase 2 loop:

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `POST /api/tasks`
- `POST /api/tasks/:taskId/approve`
- gateway ACP routes under `/agents`, `/runs`, and `/runs/:runId`

Responses gain additional metadata such as:

- `recoveryState`
- `recoveryReason`
- `lastRecoveredAt`
- `latestEventId`
- `latestProjectionVersion`

### New Read-Only Replay APIs
Phase 3-1 adds:

- `GET /api/tasks/:taskId/events`
- `GET /api/tasks/:taskId/diffs`
- `GET /api/tasks/:taskId/replay?asOfEventId=...`
- `GET /api/tasks/:taskId/runs`
- `GET /api/tasks/:taskId/artifacts`
- `GET /api/recovery/summary`

No operator mutation endpoints are added in this phase. The schema reserves for them, but the API remains read-only beyond the existing task workflow actions.

## Implementation Batches
Phase 3-1 should be delivered in five batches:

1. Postgres setup, migrations, base event store, and base projection tables
2. `control-plane` eventized write path with backward-compatible task APIs
3. `acp-gateway` eventized run persistence and recovery markers
4. replay and audit read APIs
5. web replay UI with timeline, diff inspector, and recovery badges

Recommended execution order:

- first: batches 1, 2, and 4
- second: batch 3
- third: batch 5

This keeps task truth and replay queryability ahead of operator-facing presentation polish.

## Non-Goals
Phase 3-1 does not implement:

- authenticated login
- RBAC enforcement
- operator write actions
- automatic resume of ambiguous in-flight execution
- multi-machine scheduling
- autonomous branch creation or merge automation

Those remain later-phase features, but all event and projection records reserve the fields needed to support them cleanly.

## Success Criteria
Phase 3-1 is successful if:

- restarting services no longer erases task and run truth
- every important transition is durably explainable through immutable events
- replay endpoints can reconstruct task state at a chosen event boundary
- the web console can inspect history, diffs, and recovery markers without relying on ad hoc log scraping
