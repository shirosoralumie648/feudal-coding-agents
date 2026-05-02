# Codebase Structure

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

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
  docs/
    superpowers/
      plans/
      specs/
  .github/
    workflows/
  .planning/
    codebase/
    phases/
```

The source workspace is defined in `pnpm-workspace.yaml` as `apps/*` and `packages/*`.

## Root Config Files

- `package.json`: root scripts and shared dev dependencies.
- `pnpm-workspace.yaml`: workspace package globs.
- `pnpm-lock.yaml`: pnpm dependency lock.
- `tsconfig.base.json`: shared TypeScript compiler options and path aliases.
- `vitest.config.ts`: root Vitest project list.
- `.github/workflows/ci.yml`: CI install, test, build, and E2E pipeline.
- `AGENTS.md`: repo-local instructions for agents.
- `README.md`: current authoritative project overview.
- `CURRENT_STATUS.md`, `ROADMAP.md`: current audit and roadmap documents.
- `docs/ARCHITECTURE.md`, `docs/TERMINOLOGY.md`: current architecture and vocabulary references.

`package-lock.json` is present in the working tree but the repo is configured as a pnpm workspace. Treat pnpm files as authoritative unless the project intentionally changes package managers.

## `apps/control-plane`

```text
apps/control-plane/
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

Important files:

- `apps/control-plane/src/server.ts`: Fastify app creation and route registration.
- `apps/control-plane/src/config.ts`: default ACP clients, task store, template store, and service wiring.
- `apps/control-plane/src/store.ts`: `TaskStore` interface and in-memory task store.

Route modules:

- `apps/control-plane/src/routes/tasks.ts`
- `apps/control-plane/src/routes/agents.ts`
- `apps/control-plane/src/routes/operator-actions.ts`
- `apps/control-plane/src/routes/replay.ts`
- `apps/control-plane/src/routes/templates.ts`
- `apps/control-plane/src/routes/metrics.ts`
- `apps/control-plane/src/routes/roles.ts`

`routes/roles.ts` defines role endpoints but is not registered by `server.ts`.

Service modules:

- `apps/control-plane/src/services/orchestrator-service.ts`
- `apps/control-plane/src/services/task-coordinator.ts`
- `apps/control-plane/src/services/governance-coordinator.ts`
- `apps/control-plane/src/services/operator-coordinator.ts`
- `apps/control-plane/src/services/replay-coordinator.ts`
- `apps/control-plane/src/services/orchestrator-flows.ts`
- `apps/control-plane/src/services/orchestrator-runtime.ts`
- `apps/control-plane/src/services/task-run-gateway.ts`
- `apps/control-plane/src/services/task-metadata.ts`
- `apps/control-plane/src/services/workflow-template-*.ts`

Persistence modules:

- `apps/control-plane/src/persistence/task-event-codec.ts`
- `apps/control-plane/src/persistence/task-read-model.ts`

Governance and security modules:

- `apps/control-plane/src/governance/policy.ts`
- `apps/control-plane/src/governance/complexity-scorer.ts`
- `apps/control-plane/src/governance/auto-approval.ts`
- `apps/control-plane/src/governance/rbac-policy.ts`
- `apps/control-plane/src/governance/rbac-middleware.ts`
- `apps/control-plane/src/security/code-scanner.ts`
- `apps/control-plane/src/security/sensitive-info-detector.ts`

## `apps/acp-gateway`

```text
apps/acp-gateway/
  package.json
  vitest.config.ts
  src/
    agent-health/
    agent-protocol/
    agent-registry/
    codex/
    persistence/
    routes/
    workers/
    manifests.ts
    server.ts
    store.ts
```

Important files:

- `apps/acp-gateway/src/server.ts`: Fastify app creation and runtime wiring.
- `apps/acp-gateway/src/manifests.ts`: canonical runtime worker manifests.
- `apps/acp-gateway/src/store.ts`: run store interfaces and in-memory run store.

Route modules:

- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/routes/agents.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/agent-messaging.ts`
- `apps/acp-gateway/src/routes/agent-health.ts`

Runtime modules:

- `apps/acp-gateway/src/workers/types.ts`
- `apps/acp-gateway/src/workers/registry.ts`
- `apps/acp-gateway/src/workers/worker-runner.ts`
- `apps/acp-gateway/src/workers/json-schemas.ts`
- `apps/acp-gateway/src/workers/prompt-templates.ts`
- `apps/acp-gateway/src/codex/exec.ts`

Agent coordination modules:

- `apps/acp-gateway/src/agent-registry/types.ts`
- `apps/acp-gateway/src/agent-registry/registry.ts`
- `apps/acp-gateway/src/agent-registry/discovery.ts`
- `apps/acp-gateway/src/agent-registry/seed.ts`
- `apps/acp-gateway/src/agent-protocol/types.ts`
- `apps/acp-gateway/src/agent-protocol/json-rpc.ts`
- `apps/acp-gateway/src/agent-protocol/message-router.ts`
- `apps/acp-gateway/src/agent-health/types.ts`
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`

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
- `apps/web/src/hooks/use-task-console.ts`: central state and action hook.

Components:

- `apps/web/src/components/new-task-panel.tsx`
- `apps/web/src/components/task-detail-panel.tsx`
- `apps/web/src/components/approval-inbox-panel.tsx`
- `apps/web/src/components/operator-queue-panel.tsx`
- `apps/web/src/components/operator-console-panel.tsx`
- `apps/web/src/components/timeline-panel.tsx`
- `apps/web/src/components/diff-inspector-panel.tsx`
- `apps/web/src/components/agent-registry-panel.tsx`
- `apps/web/src/components/governance-panel.tsx`
- `apps/web/src/components/revision-panel.tsx`

Client libraries:

- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/console-actions.ts`
- `apps/web/src/lib/console-data.ts`
- `apps/web/src/lib/task-lanes.ts`
- `apps/web/src/lib/url-state.ts`
- `apps/web/src/lib/workflow-phase.ts`

## `packages/contracts`

```text
packages/contracts/
  package.json
  src/
    index.ts
    governance/
```

`packages/contracts/src/index.ts` is the central shared schema file.

Governance submodules:

- `packages/contracts/src/governance/rbac.ts`
- `packages/contracts/src/governance/rule-engine.ts`
- `packages/contracts/src/governance/auto-approval.ts`
- `packages/contracts/src/governance/index.ts`

## `packages/orchestrator`

```text
packages/orchestrator/
  package.json
  src/
    task-machine.ts
    task-machine.test.ts
```

The package currently exports one state-machine module.

## `packages/acp`

```text
packages/acp/
  package.json
  src/
    index.ts
    http-client.ts
    mock-client.ts
```

`packages/acp/src/index.ts` is protocol/interface definition. `mock-client.ts` and `http-client.ts` are runtime clients.

## `packages/persistence`

```text
packages/persistence/
  package.json
  src/
    event-store.ts
    index.ts
    migrations.ts
    postgres.ts
```

This package is infrastructure-only and intentionally has no dependency on app-level task/run types.

## Test Placement

Tests are colocated with source:

- `packages/*/src/*.test.ts`
- `apps/control-plane/src/**/*.test.ts`
- `apps/acp-gateway/src/**/*.test.ts`
- `apps/web/src/*.test.tsx`
- `apps/web/src/lib/*.test.ts`
- `apps/web/e2e/*.spec.ts`

There are 42 TypeScript/TSX test and E2E files under `apps` and `packages` in the current checkout.

## Documentation Structure

Current high-signal docs:

- `README.md`
- `CURRENT_STATUS.md`
- `ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/TERMINOLOGY.md`

Historical planning material lives under:

- `docs/superpowers/specs/`
- `docs/superpowers/plans/`

GSD planning artifacts live under:

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/`
- `.planning/codebase/`

## Naming Patterns

- Source files use kebab-case, such as `task-machine.ts`, `task-run-gateway.ts`, and `message-router.ts`.
- React component files use kebab-case filenames and PascalCase component exports, such as `task-detail-panel.tsx` exporting `TaskDetailPanel`.
- Tests use source filename plus `.test.ts` or `.test.tsx`.
- Route registration functions use `register*Routes`, such as `registerTaskRoutes()`.
- Service factories use `create*`, such as `createOrchestratorService()`, `createTaskCoordinator()`, and `createWorkerRunner()`.

