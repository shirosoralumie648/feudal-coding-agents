# Codebase Structure

**Analysis Date:** 2026-05-04

## Root Layout

```text
feudal-coding-agents/
  apps/
    acp-gateway/
    control-plane/
    web/
  packages/
    acp/
    contracts/
    orchestrator/
    persistence/
  plugins/
    examples/
  docs/
    plugins/
    superpowers/
  .github/
    workflows/
  .planning/
    codebase/
    phases/
```

The workspace boundary is defined by `pnpm-workspace.yaml` as `apps/*` and `packages/*`.

## Root Config and Docs

High-signal root files:
- `package.json`: root scripts and shared dev dependencies.
- `pnpm-workspace.yaml`: workspace package globs.
- `pnpm-lock.yaml`: pnpm dependency lock.
- `tsconfig.base.json`: shared TypeScript compiler settings and aliases.
- `tsconfig.typecheck.json`: implementation typecheck gate.
- `vitest.config.ts`: root Vitest project list.
- `.github/workflows/ci.yml`: CI install, test, build, and E2E pipeline.
- `.mcp.json`: local MCP/agent tooling configuration.
- `README.md`: current overview and document authority order.
- `CURRENT_STATUS.md`, `ROADMAP.md`: audit and roadmap baselines.
- `docs/ARCHITECTURE.md`, `docs/TERMINOLOGY.md`: runtime architecture and vocabulary.
- `docs/plugins/sdk.md`: local plugin SDK guidance.

`package-lock.json` is present, but pnpm files are authoritative.

## `apps/control-plane`

```text
apps/control-plane/
  config/
    alert-rules.json
  package.json
  src/
    config.ts
    server.ts
    governance/
    operator-actions/
    persistence/
    routes/
    security/
    services/
    store.ts
```

Entry and wiring:
- `apps/control-plane/src/server.ts`: Fastify app factory and route registration.
- `apps/control-plane/src/config.ts`: default task store, ACP client, plugin roots, template store, and orchestrator service wiring.
- `apps/control-plane/src/store.ts`: task store interface and memory store.

Route modules:
- `apps/control-plane/src/routes/agents.ts`
- `apps/control-plane/src/routes/tasks.ts`
- `apps/control-plane/src/routes/templates.ts`
- `apps/control-plane/src/routes/plugins.ts`
- `apps/control-plane/src/routes/operator-actions.ts`
- `apps/control-plane/src/routes/replay.ts`
- `apps/control-plane/src/routes/metrics.ts`
- `apps/control-plane/src/routes/analytics.ts`
- `apps/control-plane/src/routes/alerts.ts`
- `apps/control-plane/src/routes/roles.ts`

Services:
- `apps/control-plane/src/services/orchestrator-service.ts`
- `apps/control-plane/src/services/task-coordinator.ts`
- `apps/control-plane/src/services/governance-coordinator.ts`
- `apps/control-plane/src/services/operator-coordinator.ts`
- `apps/control-plane/src/services/replay-coordinator.ts`
- `apps/control-plane/src/services/orchestrator-flows.ts`
- `apps/control-plane/src/services/orchestrator-runtime.ts`
- `apps/control-plane/src/services/task-run-gateway.ts`
- `apps/control-plane/src/services/metrics-service.ts`
- `apps/control-plane/src/services/analytics-service.ts`
- `apps/control-plane/src/services/alert-service.ts`
- `apps/control-plane/src/services/plugin-*.ts`
- `apps/control-plane/src/services/workflow-template-*.ts`

Governance and security:
- `apps/control-plane/src/governance/policy.ts`
- `apps/control-plane/src/governance/complexity-scorer.ts`
- `apps/control-plane/src/governance/auto-approval.ts`
- `apps/control-plane/src/governance/rbac-policy.ts`
- `apps/control-plane/src/governance/rbac-middleware.ts`
- `apps/control-plane/src/security/code-scanner.ts`
- `apps/control-plane/src/security/execution-scanner.ts`
- `apps/control-plane/src/security/sensitive-info-detector.ts`

Add new control-plane API surfaces under `apps/control-plane/src/routes/`, put orchestration behavior in `apps/control-plane/src/services/`, and keep shared request/response contracts in `packages/contracts` when they cross package boundaries.

## `apps/acp-gateway`

```text
apps/acp-gateway/
  package.json
  vitest.config.ts
  src/
    agent-health/
    agent-protocol/
    agent-registry/
    agent-scheduler/
    codex/
    persistence/
    plugins/
    routes/
    workers/
    manifests.ts
    server.ts
    store.ts
```

Entry and wiring:
- `apps/acp-gateway/src/server.ts`: Fastify app factory and route registration.
- `apps/acp-gateway/src/manifests.ts`: canonical runtime worker manifests.
- `apps/acp-gateway/src/store.ts`: run store interface and memory store.

Routes:
- `apps/acp-gateway/src/routes/agents.ts`
- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/agent-messaging.ts`
- `apps/acp-gateway/src/routes/agent-health.ts`
- `apps/acp-gateway/src/routes/agent-scheduler.ts`

Runtime workers:
- `apps/acp-gateway/src/workers/types.ts`
- `apps/acp-gateway/src/workers/registry.ts`
- `apps/acp-gateway/src/workers/worker-runner.ts`
- `apps/acp-gateway/src/workers/json-schemas.ts`
- `apps/acp-gateway/src/workers/prompt-templates.ts`
- `apps/acp-gateway/src/codex/exec.ts`

Agent coordination:
- `apps/acp-gateway/src/agent-registry/*.ts`
- `apps/acp-gateway/src/agent-protocol/*.ts`
- `apps/acp-gateway/src/agent-health/*.ts`
- `apps/acp-gateway/src/agent-scheduler/*.ts`

Gateway plugin adapter:
- `apps/acp-gateway/src/plugins/index.ts`
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`

Add new execution-plane capabilities under the relevant `agent-*`, `workers`, `routes`, or `plugins` subdirectory. Keep gateway route tests close to the route module.

## `apps/web`

```text
apps/web/
  package.json
  index.html
  vite.config.ts
  playwright.config.ts
  playwright-webserver.ts
  src/
    app.tsx
    main.tsx
    styles.css
    components/
    hooks/
    lib/
    test/
  e2e/
```

Composition:
- `apps/web/src/main.tsx`: React mount.
- `apps/web/src/app.tsx`: top-level console layout.
- `apps/web/src/hooks/use-task-console.ts`: main task console state/action hook.
- `apps/web/src/hooks/use-analytics.ts`: analytics and alert data hook.

Components:
- `apps/web/src/components/new-task-panel.tsx`
- `apps/web/src/components/task-detail-panel.tsx`
- `apps/web/src/components/approval-inbox-panel.tsx`
- `apps/web/src/components/operator-queue-panel.tsx`
- `apps/web/src/components/operator-console-panel.tsx`
- `apps/web/src/components/timeline-panel.tsx`
- `apps/web/src/components/diff-inspector-panel.tsx`
- `apps/web/src/components/agent-registry-panel.tsx`
- `apps/web/src/components/analytics-dashboard.tsx`
- `apps/web/src/components/audit-trail-viewer.tsx`
- `apps/web/src/components/alert-panel.tsx`
- `apps/web/src/components/plugin-ecosystem-panel.tsx`

Client libraries:
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/console-actions.ts`
- `apps/web/src/lib/console-data.ts`
- `apps/web/src/lib/task-lanes.ts`
- `apps/web/src/lib/url-state.ts`
- `apps/web/src/lib/workflow-phase.ts`

Add new UI panels under `apps/web/src/components/`, shared browser calls under `apps/web/src/lib/api.ts`, and state orchestration under hooks or existing console-data/action modules.

## `packages/contracts`

```text
packages/contracts/
  package.json
  src/
    index.ts
    analytics/
    governance/
    plugins/
```

Primary modules:
- `packages/contracts/src/index.ts`: task, run, artifact, governance, recovery, operator, workflow phase, and token usage contracts.
- `packages/contracts/src/analytics/types.ts`: metrics, analytics stream, alerts, and audit trail contracts.
- `packages/contracts/src/governance/*.ts`: RBAC, rule engine, and auto-approval contracts.
- `packages/contracts/src/plugins/types.ts`: plugin lifecycle, extension point, permission, compatibility, security, and marketplace contracts.
- `packages/contracts/src/plugins/sdk.ts`: SDK helper functions for plugin manifests and extension definitions.

Put shared API payloads here instead of duplicating shapes in apps.

## `packages/orchestrator`

```text
packages/orchestrator/
  package.json
  src/
    task-machine.ts
    task-machine.test.ts
```

`packages/orchestrator/src/task-machine.ts` owns legal task state transitions. Application services should call `transitionTask()` rather than mutating lifecycle status by hand.

## `packages/acp`

```text
packages/acp/
  package.json
  src/
    index.ts
    http-client.ts
    mock-client.ts
```

`packages/acp/src/index.ts` defines ACP types and client interface. `packages/acp/src/http-client.ts` and `packages/acp/src/mock-client.ts` implement real HTTP and local mock clients.

## `packages/persistence`

```text
packages/persistence/
  package.json
  src/
    event-store.ts
    index.ts
    migrations.ts
    pg.d.ts
    postgres.ts
```

This package is infrastructure-only. It should not depend on app-level task or run types.

## `plugins`

```text
plugins/
  examples/
    code-review-bot/
      plugin.json
      src/index.ts
```

Local plugin examples should include a `plugin.json` manifest and an entry module matching the manifest. Remote plugin installation is not part of the current structure.

## Tests

Tests are colocated with source:
- `packages/*/src/*.test.ts`
- `apps/control-plane/src/**/*.test.ts`
- `apps/acp-gateway/src/**/*.test.ts`
- `apps/web/src/*.test.tsx`
- `apps/web/src/hooks/*.test.ts`
- `apps/web/src/lib/*.test.ts`
- `apps/web/e2e/*.spec.ts`

Current checkout contains 192 TypeScript/TSX implementation and test files under `apps` and `packages`, including 64 test/E2E files.

## Naming Patterns

- Source files use kebab-case: `task-machine.ts`, `task-run-gateway.ts`, `message-router.ts`.
- React component files use kebab-case filenames and PascalCase component exports: `task-detail-panel.tsx` exports `TaskDetailPanel`.
- Tests use `.test.ts`, `.test.tsx`, or `.spec.ts`.
- Route registration functions use `register*Routes`, such as `registerTaskRoutes()`.
- Service factories use `create*`, such as `createOrchestratorService()` and `createTaskRunGateway()`.
- Stateful classes use PascalCase, such as `MemoryTaskStore`, `GatewayStore`, `AgentRegistry`, `HeartbeatMonitor`, and `AgentScheduler`.

---

*Structure analysis: 2026-05-04*
