# Phase 6: Performance Optimization - Research

**Researched:** 2026-05-02
**Phase:** 06-performance-optimization
**Goal:** Plan targeted local performance, query, metrics, security, and verification hardening for the current Feudal Coding Agents MVP.

## Research Complete

This research answers what the planner needs to know before creating executable Phase 6 plans. Source priority was live code, tests, package manifests, `.planning/codebase/*`, and then roadmap/context docs.

## Phase Requirements

- `PSC-01`: Performance optimization and cache strategy.
- `PSC-03`: Database query optimization and N+1 reduction.
- `PSC-04`: Input validation and security scanning.

## Current Architecture Findings

### Metrics and Cache Path

- `apps/control-plane/src/routes/metrics.ts` already computes task/run aggregates when given a `TaskStore`, but its default `store` dependency is optional.
- `apps/control-plane/src/server.ts` currently calls `registerMetricsRoutes(app)` with no store, so the default app returns `status: "metrics_unavailable"` for `GET /metrics`.
- `AnalyticsService` already has a local in-process snapshot cache through `getLatestSnapshot()` and `pollMetrics()`, but `/metrics` does not reuse that cache.
- A small app-scoped metrics service can satisfy the in-process cache decision without introducing Redis or a distributed cache topology.

### Query and Projection Path

- `apps/control-plane/src/services/analytics-service.ts` uses `store.listTasks()` for metric snapshots and falls back to loading audit events by calling `store.listTaskEvents(task.id)` once per task when no event store is injected.
- `apps/control-plane/src/persistence/task-read-model.ts` has persisted tables for `tasks_current`, `runs_current`, `artifacts_current`, and `task_history_entries`.
- `listTaskEvents(taskId)` currently calls `getTask(taskId)` before `loadStream("task", taskId)`. That hydrates history, artifacts, and runs even though event listing only needs existence.
- `listTaskRuns(taskId)` and `listTaskArtifacts(taskId)` do existence checks against `tasks_current` before loading child rows. These are smaller than the event-path hydration but still good candidates for a shared lightweight `taskExists` helper.
- `getRecoverySummary()` already uses aggregate SQL and is a pattern to preserve.
- `apps/acp-gateway/src/persistence/run-read-model.ts` has save, get, and rebuild paths only. It should keep checkpoint semantics if any run projection optimization is added.

### Security Path

- `apps/control-plane/src/security/code-scanner.ts` exposes `scanCodeSecurity()` and `shouldBlockExecution()` and already treats critical/high matches as blocking.
- `apps/control-plane/src/security/sensitive-info-detector.ts` exposes `scanForSensitiveInfo()` and `redactSensitiveInfo()`.
- `apps/control-plane/src/services/orchestrator-flows.ts` accepts executor output, transitions `execution.completed`, and invokes verifier without scanning executor-produced artifacts first.
- The natural enforcement point is after the executor run returns and before `execution.completed` or verifier dispatch.
- Blocking behavior should be deterministic and local. High/critical code scan findings and high severity sensitive-info matches should fail or force operator review before verifier success can be accepted.

### Typecheck Feasibility

The root `package.json` has `test`, `build`, `db:migrate`, and `e2e`, but no `typecheck` script.

A trial command was run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm exec tsc -p tsconfig.base.json --noEmit --pretty false
```

It exited with code 2. Key failure classes:

- `tsconfig.base.json` does not set JSX, so web `.tsx` files fail with `TS17004`.
- `.worktrees/*` can be discovered by a broad TypeScript project unless excluded.
- Existing source/test typing errors appear in gateway routes/tests, registry discovery, control-plane config/governance/read-model files, contract tests, and persistence `pg` imports.
- A useful typecheck gate is feasible only if Phase 6 adds a dedicated typecheck config and fixes the current baseline errors. Adding a failing script alone would be noise.

## Recommended Plan Shape

1. Metrics route wiring and in-process metrics cache.
2. Query fan-out reduction in task read model and analytics audit loading.
3. Security scanner enforcement on execution output.
4. Explicit typecheck baseline and package-manager guard.

This keeps the phase focused on current hot paths while covering the engineering gate decision.

## Validation Architecture

Use existing Vitest and build infrastructure. The validation strategy should sample after every task with focused commands and after each wave with the combined Phase 6 slice.

Recommended quick commands:

```bash
COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts --pool=forks
```

```bash
COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts --pool=forks
```

```bash
COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks
```

Full Phase 6 slice:

```bash
COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks
```

Typecheck gate after Plan 06-04:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm typecheck
```

## Constraints for Executors

- Keep cache in-process and app-scoped.
- Do not add Redis, queues, SaaS scanners, or network-dependent security tools.
- Preserve event-sourced projection checkpoints and replay behavior.
- Use Zod and existing route-local parse patterns for validation hardening.
- Keep `pnpm` as package-manager truth and avoid expanding npm lock artifacts.
- Treat the 200ms target as a bounded local fixture target, not a global production SLA.
