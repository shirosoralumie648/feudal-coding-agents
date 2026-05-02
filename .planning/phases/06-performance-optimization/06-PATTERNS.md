# Phase 6: Performance Optimization - Patterns

**Generated:** 2026-05-02
**Scope:** Existing code patterns for Phase 6 implementation.

## Pattern Complete

## Route Dependency Injection

Closest analogs:

- `apps/control-plane/src/routes/analytics.ts`
- `apps/control-plane/src/routes/alerts.ts`
- `apps/control-plane/src/routes/plugins.ts`

Pattern:

- Route modules export `register*Routes(app, options)` functions.
- Dependencies are passed in from `createControlPlaneApp()` so tests can inject isolated services.
- Invalid requests are parsed with Zod and return deterministic `400` responses.

Use for:

- `apps/control-plane/src/routes/metrics.ts`
- `apps/control-plane/src/server.ts`

Expected adaptation:

- Narrow metrics dependencies to the methods actually used, such as `Pick<TaskStore, "listTasks">`, or pass a dedicated metrics service.
- `createControlPlaneApp()` should wire the same app-scoped orchestrator service into metrics that task, replay, analytics, and alert paths use.

## App-Scoped Service Pattern

Closest analogs:

- `apps/control-plane/src/services/analytics-service.ts`
- `apps/control-plane/src/services/alert-service.ts`
- `apps/control-plane/src/services/plugin-extension-catalog.ts`

Pattern:

- Services take explicit constructor options.
- They keep process-local state in private fields.
- They do not start background work automatically unless server hooks call `start()`.

Use for:

- `apps/control-plane/src/services/metrics-service.ts`

Expected adaptation:

- Use a small TTL cache for `/metrics` aggregate snapshots.
- Default TTL should be short, for example `1000` ms, and testable through an injected clock.
- Do not persist cache state and do not introduce external cache infrastructure.

## Event-Sourced Projection Pattern

Closest analogs:

- `apps/control-plane/src/persistence/task-read-model.ts`
- `apps/acp-gateway/src/persistence/run-read-model.ts`
- `packages/persistence/src/event-store.ts`

Pattern:

- Persisted read models rebuild from `event_log`.
- `tasks_current`, `runs_current`, and child projection tables are the read side.
- Checkpoints are written through `writeCheckpoint()` after projection writes.

Use for:

- `apps/control-plane/src/persistence/task-read-model.ts`
- `apps/control-plane/src/services/analytics-service.ts`

Expected adaptation:

- Add lightweight existence checks instead of hydrating full task projections when only events, runs, or artifacts are requested.
- Add a bulk audit event loading path such as `listAuditEventsAfter(cursor)` so analytics audit trail does not fan out across every task.
- Preserve checkpoint and replay behavior before making query changes.

## Security Scanner Pattern

Closest analogs:

- `apps/control-plane/src/security/code-scanner.ts`
- `apps/control-plane/src/security/sensitive-info-detector.ts`
- `apps/control-plane/src/services/orchestrator-flows.ts`

Pattern:

- Security scanners are pure functions with deterministic outputs.
- `shouldBlockExecution()` already maps critical/high code findings to a blocking decision.
- Orchestration flow owns transitions between executor output and verifier acceptance.

Use for:

- `apps/control-plane/src/security/execution-scanner.ts`
- `apps/control-plane/src/services/orchestrator-flows.ts`
- `apps/control-plane/src/services/orchestrator-flows.test.ts`

Expected adaptation:

- Normalize executor artifact content to strings with bounded JSON serialization.
- Scan executor-produced artifacts before `execution.completed`.
- If blocked, transition through `execution.failed`, append a scan report artifact, and do not call verifier.
- If not blocked, attach diagnostics so medium/low findings remain visible.

## Typecheck Gate Pattern

Closest analogs:

- Root `package.json` script shape.
- `apps/web/tsconfig.json` for JSX compiler options.
- `vitest.config.ts` for workspace-wide path selection.

Pattern:

- Root scripts call workspace tools through pnpm.
- Test commands are explicit and non-watch.
- Current root TypeScript config is a base config, not a complete check project.

Use for:

- `package.json`
- `tsconfig.typecheck.json`
- targeted source/test files reported by `tsc`.

Expected adaptation:

- Add `tsconfig.typecheck.json` that excludes `.worktrees`, `node_modules`, `dist`, Playwright reports, and build output.
- Add JSX support for web sources.
- Fix current baseline errors before adding `pnpm typecheck` as a required green command.
