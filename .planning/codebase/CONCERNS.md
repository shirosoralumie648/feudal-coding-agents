# Concerns

**Analysis Date:** 2026-05-04

## Summary

The codebase has a broad local MVP: task orchestration, governance, replay, optional persistence, web console flows, analytics/alerts, plugin lifecycle, ACP gateway registry/health/scheduling, and execution security scanning are present. The main risks are not absent source modules. They are process-local runtime semantics, large concentration files, placeholder metrics, and local-trusted assumptions that can be overstated as production-grade distributed behavior.

## High Priority

### Process-local coordination should not be described as distributed

Implemented modules:
- `apps/acp-gateway/src/agent-registry/registry.ts`
- `apps/acp-gateway/src/agent-protocol/message-router.ts`
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`
- `apps/acp-gateway/src/agent-scheduler/scheduler.ts`
- `apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.ts`

Default wiring in `apps/acp-gateway/src/server.ts` creates in-process instances.

Impact:
- Restart loses registry, mailbox, heartbeat, failover assignment, and scheduler state unless a persistent store is added.
- Multi-process or distributed scheduling semantics are not guaranteed by the current implementation.

Recommended handling:
- Keep docs and UI language clear: current semantics are local runtime coordination.
- Add persistence only when multi-process scheduling is a real requirement.

### Local trusted plugin model has sharp boundaries

Implemented modules:
- `packages/contracts/src/plugins/types.ts`
- `packages/contracts/src/plugins/sdk.ts`
- `apps/control-plane/src/services/plugin-discovery.ts`
- `apps/control-plane/src/services/plugin-store.ts`
- `apps/control-plane/src/services/plugin-marketplace.ts`
- `apps/control-plane/src/services/plugin-security-policy.ts`
- `apps/control-plane/src/routes/plugins.ts`
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`

Impact:
- Plugin discovery is local-directory based.
- Security review evaluates declared permissions and admin approval for high-risk manifests.
- There is no remote installation, dependency installation, untrusted code sandbox, signing, or runtime isolation.

Recommended handling:
- Preserve "trusted local plugin" terminology.
- Do not add remote marketplace language without adding actual install, trust, and sandbox controls.

### Template instantiation still uses default service coupling

`apps/control-plane/src/routes/templates.ts` accepts injected `store` and `engine`, but the instantiate route still calls the default task creation dependency through `defaultOrchestratorService`.

Impact:
- Alternative app instances and tests with injected stores/services can diverge from runtime behavior.
- Template routes are less dependency-injected than task, plugin, analytics, and alert routes.

Recommended fix:
- Inject task creation into `registerTemplateRoutes()`.
- Keep route modules app-scoped and avoid importing default services for behavior that should follow the app instance.

### Token usage metrics are placeholder values

Contracts exist in:
- `packages/contracts/src/index.ts`
- `packages/contracts/src/analytics/types.ts`

Implementation:
- `apps/control-plane/src/services/analytics-service.ts` returns zero token usage from `computeTokenUsage()`.
- `apps/control-plane/src/routes/metrics.ts` returns explicit zero token metrics.

Impact:
- Cost accounting, token charts, and token alerts are not real until runner token metadata is recorded and aggregated.

Recommended fix:
- Record token metadata at run completion when the ACP gateway or Codex runner can provide it.
- Aggregate by task and agent in `AnalyticsService`.

## Medium Priority

### Large concentration files

Notable large files in the current checkout:
- `apps/web/src/app.test.tsx`: 1418 lines
- `apps/control-plane/src/services/orchestrator-service.test.ts`: 1412 lines
- `apps/control-plane/src/persistence/task-read-model.ts`: 858 lines
- `apps/control-plane/src/persistence/task-read-model.test.ts`: 757 lines
- `apps/acp-gateway/src/routes/runs.test.ts`: 660 lines
- `apps/control-plane/src/routes/tasks.test.ts`: 605 lines
- `apps/control-plane/src/governance/rbac-policy.ts`: 536 lines
- `apps/control-plane/src/routes/roles.ts`: 508 lines
- `apps/web/src/hooks/use-task-console.ts`: 492 lines
- `apps/control-plane/src/services/orchestrator-flows.ts`: 448 lines

Impact:
- Failure localization is harder in large integration suites.
- `task-read-model.ts` mixes projection writes, read queries, replay, diffs, artifacts, runs, recovery, and operator action mapping.
- `use-task-console.ts` owns selection, data loading, retry, replay, governance, operator mutations, and URL state.
- `orchestrator-flows.ts` is a high-blast-radius file for planning, review, execution, verification, and security scanning.

Recommended refactors:
- Split read-model write helpers from query families when adding new persistence behavior.
- Split `use-task-console.ts` by task selection/data, governance actions, operator actions, and replay state when changing related UI flows.
- Split very large tests by behavior cluster only when a nearby change needs it; avoid cosmetic test churn.

### No lint, format, or coverage gate

Current root quality gates:
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

Missing root gates:
- lint
- formatting check
- coverage threshold

Impact:
- Style drift can accumulate because no formatter/linter enforces the repository style.
- Coverage expectations are plan-driven rather than tool-enforced.

Recommended fix:
- Add one formatter/linter deliberately if the project needs an automated style gate.
- Do not mix multiple style tools.

### Mixed package manager artifact

`package-lock.json` is present in the working tree while `package.json` declares `pnpm@10.0.0` and the repo has `pnpm-lock.yaml`.

Impact:
- Contributors or automation may accidentally use npm and produce divergent dependency resolution.

Recommended fix:
- Remove `package-lock.json` or document why it is intentionally retained.
- Keep pnpm as the package manager truth.

### Execution scanner coverage should stay on the live path

Security modules:
- `apps/control-plane/src/security/code-scanner.ts`
- `apps/control-plane/src/security/sensitive-info-detector.ts`
- `apps/control-plane/src/security/execution-scanner.ts`

Live wiring:
- `apps/control-plane/src/services/orchestrator-flows.ts` calls `scanExecutionArtifacts()` after executor output and before verification.

Impact:
- This is now a live guardrail, so future execution refactors can accidentally bypass it.

Recommended handling:
- Keep tests in `apps/control-plane/src/security/execution-scanner.test.ts` and `apps/control-plane/src/services/orchestrator-flows.test.ts` aligned with the live flow.
- Add regression tests whenever execution artifacts or worker output shape changes.

## Lower Priority

### Gateway cancellation is immediate

`apps/acp-gateway/src/routes/runs.ts` transitions cancellation to final state without a deeper child-process interruption protocol.

Impact:
- Most callers observe cancellation as a final state.
- Running child-process cancellation is not a robust multi-step handshake.

Recommended handling:
- Keep immediate cancellation if acceptable for MVP.
- If real interruption is required, connect cancellation to `apps/acp-gateway/src/codex/exec.ts` and worker-runner lifecycle.

### Public auth remains out of scope

RBAC route and policy code exists:
- `apps/control-plane/src/routes/roles.ts`
- `apps/control-plane/src/governance/rbac-policy.ts`
- `apps/control-plane/src/governance/rbac-middleware.ts`
- `packages/contracts/src/governance/rbac.ts`

But public identity-provider integration is not wired into the current servers.

Impact:
- Local role management is implemented.
- Auth/session/multi-tenant boundaries are not implemented.

Recommended handling:
- Do not describe RBAC as production authentication.
- Add identity/session design before exposing this beyond a trusted local deployment.

### Historical docs can mislead planning

`README.md` defines the authority order and states that historical plans/specs are not current runtime truth.

Impact:
- `docs/superpowers/plans/*` and `三省六部Agent集群架构设计.md` can overstate distributed or institutionalized runtime behavior.

Recommended handling:
- Use `apps/*`, `packages/*`, root config, and CI as current-state authority.
- Use historical docs only for product intent and naming context.

## Resolved Since Older Maps

These earlier concerns are resolved in the current checkout:
- RBAC role routes are registered by `apps/control-plane/src/server.ts`.
- Metrics routes are registered with `MetricsService` by `apps/control-plane/src/server.ts`.
- Execution security scanning is wired into the live execution flow.
- A root `pnpm typecheck` command exists.
- Scheduler routes are registered by `apps/acp-gateway/src/server.ts`.
- Plugin ecosystem panel and plugin routes are present.

## Verification Notes

This map changed only `.planning/codebase/*.md`. It did not change source behavior.

Before implementation planning, prefer:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For browser-facing or route-flow changes, also run:

```bash
pnpm e2e
```

---

*Concerns analysis: 2026-05-04*
