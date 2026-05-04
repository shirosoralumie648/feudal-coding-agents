# Conventions

**Analysis Date:** 2026-05-04

## Language and Module Style

- Use TypeScript for app and package source.
- Use ESM modules; manifests declare `"type": "module"`.
- Use 2-space indentation and double quotes.
- Keep `strict` TypeScript compatibility with `tsconfig.base.json`.
- Prefer explicit imports from workspace packages over duplicate local shapes.
- Keep source filenames kebab-case.

Representative files:
- `apps/control-plane/src/server.ts`
- `apps/acp-gateway/src/server.ts`
- `apps/web/src/app.tsx`
- `packages/contracts/src/index.ts`
- `packages/orchestrator/src/task-machine.ts`

## File Naming

Observed naming patterns:
- Source files: `task-machine.ts`, `task-run-gateway.ts`, `message-router.ts`, `workflow-template-engine.ts`.
- React component files: `task-detail-panel.tsx`, `approval-inbox-panel.tsx`, `plugin-ecosystem-panel.tsx`.
- Tests: `task-machine.test.ts`, `worker-runner.test.ts`, `app.test.tsx`, `task-flow.spec.ts`.
- Route files: `tasks.ts`, `roles.ts`, `plugins.ts`, `agent-scheduler.ts`.
- Domain helper modules: `policy.ts`, `registry.ts`, `discovery.ts`, `json-schemas.ts`.

## Export Patterns

Prefer factories for app/service composition:
- `createControlPlaneApp()` in `apps/control-plane/src/server.ts`.
- `createGatewayApp()` in `apps/acp-gateway/src/server.ts`.
- `createOrchestratorService()` in `apps/control-plane/src/services/orchestrator-service.ts`.
- `createTaskRunGateway()` in `apps/control-plane/src/services/task-run-gateway.ts`.
- `createPostgresEventStore()` in `packages/persistence/src/event-store.ts`.
- `createMockACPClient()` in `packages/acp/src/mock-client.ts`.
- `createHttpACPClient()` in `packages/acp/src/http-client.ts`.
- `createWorkflowTemplateEngine()` in `apps/control-plane/src/services/workflow-template-engine.ts`.

Use classes when mutable state is central:
- `MemoryTaskStore` in `apps/control-plane/src/store.ts`.
- `GatewayStore` in `apps/acp-gateway/src/store.ts`.
- `AgentRegistry` in `apps/acp-gateway/src/agent-registry/registry.ts`.
- `HeartbeatMonitor` in `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`.
- `FailoverHandler` in `apps/acp-gateway/src/agent-health/failover-handler.ts`.
- `AgentScheduler` in `apps/acp-gateway/src/agent-scheduler/scheduler.ts`.
- `MetricsService`, `AnalyticsService`, and `AlertService` in `apps/control-plane/src/services/`.

## Validation Style

Use Zod as the standard validation layer.

Shared schemas belong in:
- `packages/contracts/src/index.ts`
- `packages/contracts/src/analytics/types.ts`
- `packages/contracts/src/governance/*.ts`
- `packages/contracts/src/plugins/types.ts`

Route-local schemas are appropriate for path params, body variants, and query strings that are not shared contracts:
- `apps/control-plane/src/routes/tasks.ts`
- `apps/control-plane/src/routes/operator-actions.ts`
- `apps/control-plane/src/routes/templates.ts`
- `apps/control-plane/src/routes/plugins.ts`
- `apps/control-plane/src/routes/roles.ts`
- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/agent-scheduler.ts`

Use `safeParse()` when returning controlled `400` responses. Use `parse()` when validating trusted internal records or response contracts.

## State and Lifecycle Rules

Task lifecycle truth belongs to `packages/orchestrator/src/task-machine.ts`.

Control-plane code should use `transitionTask()` for lifecycle changes rather than assigning `status` directly.

`workflowPhase` is derived by `deriveWorkflowPhase()` in `packages/contracts/src/index.ts`. Do not persist or cache it as lifecycle truth.

Task flow helpers live in `apps/control-plane/src/services/orchestrator-flows.ts`. Keep new orchestration steps there or in adjacent service modules instead of burying them in route handlers.

## Persistence Conventions

Event store writes use optimistic concurrency:
- event streams are keyed by `stream_type`, `stream_id`, and `event_version`
- callers provide `expectedVersion`
- unique constraint conflicts normalize to version mismatch errors in `packages/persistence/src/event-store.ts`

Projection writers:
- task projection logic is in `apps/control-plane/src/persistence/task-read-model.ts`
- run projection logic is in `apps/acp-gateway/src/persistence/run-read-model.ts`

Memory stores should mirror expected-version behavior:
- `MemoryTaskStore.saveTask()` in `apps/control-plane/src/store.ts`
- `GatewayStore.saveRun()` in `apps/acp-gateway/src/store.ts`

## Governance and Operator Separation

Governance actions are:
- `approve`
- `reject`
- `revise`

Operator actions are:
- `recover`
- `takeover`
- `abandon`

Keep these surfaces separated across contracts, services, and routes:
- `TaskActionSchema` and `OperatorActionTypeSchema` in `packages/contracts/src/index.ts`.
- governance route logic in `apps/control-plane/src/routes/tasks.ts`.
- operator route logic in `apps/control-plane/src/routes/operator-actions.ts`.
- coordination in `apps/control-plane/src/services/governance-coordinator.ts` and `apps/control-plane/src/services/operator-coordinator.ts`.

## Plugin Conventions

Plugins are local trusted manifests:
- put shared schema changes in `packages/contracts/src/plugins/types.ts`
- expose SDK helpers in `packages/contracts/src/plugins/sdk.ts`
- discover local directories through `apps/control-plane/src/services/plugin-discovery.ts`
- manage lifecycle through `apps/control-plane/src/services/plugin-store.ts`
- evaluate compatibility/security through `apps/control-plane/src/services/plugin-marketplace.ts` and `apps/control-plane/src/services/plugin-security-policy.ts`
- adapt enabled ACP worker extensions in `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`

Do not model current plugins as remote packages, runtime dependency installers, or untrusted sandboxed code.

## Security Conventions

Security scanning modules live in `apps/control-plane/src/security/`.

Execution artifact scanning is wired into `apps/control-plane/src/services/orchestrator-flows.ts` through `scanExecutionArtifacts()`. New executor output paths should preserve this enforcement point.

Sensitive data rules:
- never read `.env` contents for documentation or mapping work
- do not include secrets in generated docs
- keep plugin permission review explicit through `PluginSecurityPolicy`

## Frontend Conventions

Use functional React components.

Panels should receive data and callbacks via props:
- `apps/web/src/components/task-detail-panel.tsx`
- `apps/web/src/components/approval-inbox-panel.tsx`
- `apps/web/src/components/operator-queue-panel.tsx`
- `apps/web/src/components/analytics-dashboard.tsx`
- `apps/web/src/components/plugin-ecosystem-panel.tsx`

Keep browser effects and mutations outside leaf components:
- API calls in `apps/web/src/lib/api.ts`
- bootstrap/load composition in `apps/web/src/lib/console-data.ts`
- mutation orchestration in `apps/web/src/lib/console-actions.ts`
- task console state in `apps/web/src/hooks/use-task-console.ts`
- analytics state in `apps/web/src/hooks/use-analytics.ts`

When adding a new backend endpoint, add a typed wrapper in `apps/web/src/lib/api.ts` and cover it in `apps/web/src/lib/api.test.ts`.

## Error Handling

Common patterns:
- Route layers translate known domain errors into HTTP responses.
- `ActionNotAllowedError` in `apps/control-plane/src/services/orchestrator-runtime.ts` maps governance conflicts to `409`.
- `OperatorActionNotAllowedError` in `apps/control-plane/src/operator-actions/policy.ts` maps operator conflicts to `409`.
- Template route errors are normalized by `handleStoreError()` in `apps/control-plane/src/routes/templates.ts`.
- Plugin route errors are normalized by `handlePluginError()` in `apps/control-plane/src/routes/plugins.ts`.
- Postgres unique constraint races become stable optimistic-version errors in `packages/persistence/src/event-store.ts`.

Prefer stable domain error messages when tests or API clients depend on them.

## Comments and Documentation

Most implementation code is self-documenting through names. Comments are appropriate for:
- event/projection ordering
- scanner rationale
- workflow template expansion
- non-obvious concurrency or recovery behavior

Avoid broad narrative comments in source when the module and function names already explain the behavior.

## Formatting and Quality Gates

Use root checks:
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e` for browser flows

There is no configured ESLint, Prettier, or Biome. Match nearby formatting until a formatter is intentionally introduced.

---

*Convention analysis: 2026-05-04*
