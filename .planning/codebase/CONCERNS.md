# Concerns

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## Summary

The codebase has a solid local MVP shape: task orchestration, governance, run execution, replay, projections, and web console flows are present. The main risks are not missing source files. They are wiring gaps, process-local implementations being described as broader runtime features, large concentration files, and missing engineering gates.

## High Priority

### RBAC role routes are not registered

Code exists in:

- `apps/control-plane/src/routes/roles.ts`
- `apps/control-plane/src/governance/rbac-policy.ts`
- `apps/control-plane/src/governance/rbac-middleware.ts`
- `packages/contracts/src/governance/rbac.ts`

But `apps/control-plane/src/server.ts` does not call `registerRoleRoutes()`.

Impact:

- RBAC/role route functionality may be implemented but not reachable from the default control-plane app.
- Tests that instantiate role routes directly would not prove production wiring.

Recommended next check:

- Decide whether role APIs are in current scope.
- If yes, register them in `createControlPlaneApp()` and add a default-app route test.
- If no, document them as inactive scaffolding.

### Metrics route is registered without a store

`apps/control-plane/src/routes/metrics.ts` can compute task/run aggregates if passed a `TaskStore`.

`apps/control-plane/src/server.ts` currently calls:

```ts
registerMetricsRoutes(app);
```

Impact:

- `GET /metrics` returns `metrics_unavailable` in the default app.
- `GET /metrics/tokens` returns zero placeholder data.
- Metrics docs or roadmap should not treat observability as complete.

Recommended fix:

- Pass the same task store/service dependency used by the orchestrator, or keep `/metrics` explicitly labeled as placeholder.

### Template instantiation bypasses injected app dependencies

`apps/control-plane/src/routes/templates.ts` accepts `store` and `engine` options, but the instantiate route calls `defaultOrchestratorService.createTask()` directly.

Impact:

- Tests or alternative app instances that inject stores/services can diverge from runtime behavior.
- Template instantiation is less isolated than other route modules.

Recommended fix:

- Inject the task creation dependency into `registerTemplateRoutes()`.
- Avoid importing `defaultOrchestratorService` inside the route module for behavior that should be app-scoped.

### Process-local registry, messaging, and health state

The ACP gateway has substantial code for registry, discovery, messaging, health, and failover:

- `apps/acp-gateway/src/agent-registry/registry.ts`
- `apps/acp-gateway/src/agent-protocol/message-router.ts`
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`

By default, these are in-memory/process-local.

Impact:

- Restart loses registry, mailbox, health, and failover assignment state unless explicit stores are added.
- It should not be described as a distributed cluster registry yet.

Recommended fix:

- Document process-local semantics clearly.
- Add persistent stores only when multi-process behavior becomes an actual requirement.

## Medium Priority

### Large concentration files

Notable large files:

- `apps/control-plane/src/services/orchestrator-service.test.ts`: 1412 lines
- `apps/web/src/app.test.tsx`: 1350 lines
- `apps/control-plane/src/persistence/task-read-model.ts`: 841 lines
- `apps/web/src/hooks/use-task-console.ts`: 490 lines
- `apps/control-plane/src/routes/roles.ts`: 468 lines
- `apps/control-plane/src/governance/rbac-middleware.ts`: 338 lines
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`: 303 lines
- `apps/acp-gateway/src/routes/runs.ts`: 299 lines

Impact:

- Failures in large integration tests can be slow to localize.
- `task-read-model.ts` mixes projection writes, query methods, replay, diffs, recovery summaries, artifacts, runs, and operator actions.
- `use-task-console.ts` owns bootstrap, selection, retry, replay, governance, operator mutations, and URL state.

Recommended refactors:

- Split read-model query families from projection write helpers.
- Split `use-task-console.ts` into task selection/data, governance actions, operator actions, and replay state hooks.
- Split very large test suites by behavior cluster while preserving integration coverage.

### No lint, format, or typecheck gate

Root `package.json` has `test`, `build`, `dev`, `db:migrate`, and `e2e`, but no lint/format/typecheck script.

Impact:

- Style drift is already visible in files such as `apps/control-plane/src/routes/templates.ts` and `apps/web/src/lib/api.ts`.
- Type-only regressions may be caught indirectly through tests/build, but not as a dedicated gate for backend packages.

Recommended fix:

- Add explicit `pnpm typecheck`.
- Add one formatter/linter only after deciding repo standards; do not mix multiple tools.

### Security scanner is implemented but not wired into execution

Security modules exist:

- `apps/control-plane/src/security/code-scanner.ts`
- `apps/control-plane/src/security/sensitive-info-detector.ts`

Tests cover scanner behavior, but current orchestration flow in `apps/control-plane/src/services/orchestrator-flows.ts` does not appear to call these scanners before accepting executor output.

Impact:

- Security scanning is a library capability, not a live guardrail.

Recommended fix:

- Define where scanning belongs: before task submission, before worker execution, after executor output, or all of the above.
- Add route/service tests for the chosen enforcement point.

### Mixed package manager artifacts

The repo is a pnpm workspace, but `package-lock.json` is present in the working tree.

Impact:

- Future contributors or CI changes could accidentally use npm instead of pnpm.

Recommended fix:

- Remove or intentionally justify `package-lock.json`.
- Keep `pnpm-lock.yaml` as the package manager truth.

## Lower Priority

### Token metrics are placeholder

Contracts define token usage schemas in `packages/contracts/src/index.ts`, and `GET /metrics/tokens` exists in `apps/control-plane/src/routes/metrics.ts`, but the endpoint returns zeros.

Impact:

- Product docs should not claim real cost accounting yet.

Recommended fix:

- Record token metadata at run creation/completion if the runner can provide it.
- Aggregate by task and agent from run projections.

### Gateway run cancellation is immediate

`apps/acp-gateway/src/routes/runs.ts` implements `/runs/:runId/cancel` by transitioning to `cancelling` and then immediately to `cancelled`.

Impact:

- There is no asynchronous cancellation handshake with a running child process.
- UI or metrics may observe cancellation only as a final state in most cases.

Recommended fix:

- Keep immediate cancellation if acceptable for MVP.
- If real process cancellation is needed, connect cancellation to `apps/acp-gateway/src/codex/exec.ts` and worker runner lifecycle.

### Duplicate or overlapping governance systems

There are simple governance policies in `apps/control-plane/src/governance/policy.ts`, plus more advanced RBAC/rule/auto-approval modules under `apps/control-plane/src/governance/` and `packages/contracts/src/governance/`.

Impact:

- It is easy for docs to overstate which governance engine is actually on the task path.

Recommended fix:

- Mark each governance module as live, inactive scaffold, or roadmap.
- Wire only the modules that are meant to affect task lifecycle.

### Historical docs can still mislead readers

The root README explicitly defines authority order and warns against treating historical narrative docs as current runtime fact.

Impact:

- New planning work can still overfit to `docs/superpowers/plans/*` or the historical Chinese architecture document if it ignores current code.

Recommended fix:

- Continue treating `apps/*`, `packages/*`, root config, and CI as authority.
- Keep historical docs as background only.

## Verification Notes

For this mapping pass, the most relevant validation is document generation and secret scanning. No source behavior was changed by the map itself.

Before using this map for implementation planning, prefer running:

```bash
pnpm test
pnpm build
```

For web or route changes, also run:

```bash
pnpm e2e
```

