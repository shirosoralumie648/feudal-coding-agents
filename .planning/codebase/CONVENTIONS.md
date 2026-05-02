# Conventions

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## Language and Module Style

- TypeScript is used across app and package source.
- ESM is the module format. Package manifests use `"type": "module"`.
- Imports use explicit file-relative module paths for local source and package aliases for workspace packages.
- The codebase uses 2-space indentation and double quotes.
- `strict` TypeScript mode is enabled through `tsconfig.base.json`.

## File Naming

Observed file conventions:

- kebab-case source files: `task-machine.ts`, `task-run-gateway.ts`, `message-router.ts`
- colocated tests: `task-machine.test.ts`, `worker-runner.test.ts`, `app.test.tsx`
- React components in kebab-case files: `task-detail-panel.tsx`, `approval-inbox-panel.tsx`
- domain helper modules named by responsibility: `policy.ts`, `registry.ts`, `discovery.ts`, `json-schemas.ts`

## Export Patterns

Most backend modules export factories or classes rather than singletons.

Examples:

- `createControlPlaneApp()` in `apps/control-plane/src/server.ts`
- `createGatewayApp()` in `apps/acp-gateway/src/server.ts`
- `createOrchestratorService()` in `apps/control-plane/src/services/orchestrator-service.ts`
- `createTaskRunGateway()` in `apps/control-plane/src/services/task-run-gateway.ts`
- `createPostgresEventStore()` in `packages/persistence/src/event-store.ts`
- `createMockACPClient()` in `packages/acp/src/mock-client.ts`
- `createHttpACPClient()` in `packages/acp/src/http-client.ts`

Classes are used when stateful behavior is central:

- `MemoryTaskStore` in `apps/control-plane/src/store.ts`
- `GatewayStore` in `apps/acp-gateway/src/store.ts`
- `AgentRegistry` in `apps/acp-gateway/src/agent-registry/registry.ts`
- `AgentDiscoveryService` in `apps/acp-gateway/src/agent-registry/discovery.ts`
- `HeartbeatMonitor` in `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `FailoverHandler` in `apps/acp-gateway/src/agent-health/failover-handler.ts`

## Validation Style

Zod is the standard validation layer.

Shared domain schemas are in `packages/contracts/src/index.ts` and `packages/contracts/src/governance/*.ts`.

Route modules validate params, bodies, and queries locally:

- `TaskSpecSchema` in `apps/control-plane/src/routes/tasks.ts`
- `OperatorActionRequestSchema`-style local schemas in `apps/control-plane/src/routes/operator-actions.ts`
- `RunCreateSchema` in `apps/acp-gateway/src/routes/runs.ts`
- `AgentRegistrationInputSchema` and route-local schemas in `apps/acp-gateway/src/routes/agent-registry.ts`
- `WorkflowTemplateSchema`-derived schemas in `apps/control-plane/src/routes/templates.ts`

Pattern: use `schema.parse()` for expected internal correctness and `safeParse()` when returning controlled `400` responses.

## Error Handling

Common patterns:

- Domain errors use plain `Error` with stable message prefixes, such as `Event version mismatch for task:...` and `Event version mismatch for run:...`.
- Route layers translate known domain errors into HTTP responses.
- `ActionNotAllowedError` in `apps/control-plane/src/services/orchestrator-runtime.ts` maps governance conflicts to `409`.
- `OperatorActionNotAllowedError` in `apps/control-plane/src/operator-actions/policy.ts` maps operator conflicts to `409`.
- Template store errors are normalized by `handleStoreError()` in `apps/control-plane/src/routes/templates.ts`.
- Postgres unique constraint races are normalized to version mismatch errors in `packages/persistence/src/event-store.ts`.

## Persistence Conventions

Event store writes use optimistic concurrency:

- callers provide `expectedVersion`
- event streams are keyed by `stream_type`, `stream_id`, and `event_version`
- unique constraint conflicts are normalized to stable mismatch errors

Projection writers use upsert/replace helpers:

- task projection logic lives in `apps/control-plane/src/persistence/task-read-model.ts`
- run projection logic lives in `apps/acp-gateway/src/persistence/run-read-model.ts`

In-memory stores mirror the same expected-version behavior:

- `MemoryTaskStore.saveTask()` in `apps/control-plane/src/store.ts`
- `GatewayStore.saveRun()` in `apps/acp-gateway/src/store.ts`

## Workflow Conventions

Task lifecycle truth is centralized in `packages/orchestrator/src/task-machine.ts`.

Control-plane orchestration code does not mutate status arbitrarily; it calls `transitionTask()` with task events such as:

- `task.submitted`
- `intake.completed`
- `planning.completed`
- `review.approved`
- `approval.granted`
- `dispatch.completed`
- `execution.completed`
- `verification.passed`
- `operator.recovered`

`workflowPhase` is derived by `deriveWorkflowPhase()` in `packages/contracts/src/index.ts`.

## Governance and Operator Separation

Governance actions are:

- `approve`
- `reject`
- `revise`

Operator actions are:

- `recover`
- `takeover`
- `abandon`

The separation is reflected in:

- `TaskActionSchema` and `OperatorActionTypeSchema` in `packages/contracts/src/index.ts`
- `apps/control-plane/src/routes/tasks.ts`
- `apps/control-plane/src/routes/operator-actions.ts`
- `apps/control-plane/src/services/governance-coordinator.ts`
- `apps/control-plane/src/services/operator-coordinator.ts`

## Frontend Conventions

The web app uses functional React components and a central hook for console state.

Component files accept props and avoid direct API calls:

- `apps/web/src/components/task-detail-panel.tsx`
- `apps/web/src/components/approval-inbox-panel.tsx`
- `apps/web/src/components/operator-queue-panel.tsx`
- `apps/web/src/components/timeline-panel.tsx`

Data and mutations are separated into:

- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/console-data.ts`
- `apps/web/src/lib/console-actions.ts`

`apps/web/src/hooks/use-task-console.ts` owns most current UI state. This is consistent with the present app shape but is a hotspot for future splitting.

## Test Conventions

Vitest tests use `describe`, `it`, `expect`, and `vi`.

Backend route tests usually instantiate Fastify apps directly, as seen in:

- `apps/control-plane/src/routes/tasks.test.ts`
- `apps/control-plane/src/routes/operator-actions.test.ts`
- `apps/acp-gateway/src/routes/runs.test.ts`

Persistence tests use `pg-mem` where SQL behavior matters:

- `packages/persistence/src/event-store.test.ts`
- `apps/control-plane/src/persistence/task-read-model.test.ts`
- `apps/acp-gateway/src/persistence/run-read-model.test.ts`

Frontend unit tests use Testing Library and mocked `fetch` in:

- `apps/web/src/app.test.tsx`
- `apps/web/src/lib/api.test.ts`

Browser E2E uses Playwright in:

- `apps/web/e2e/task-flow.spec.ts`
- `apps/web/e2e/operator-console.spec.ts`

## Comments and Documentation in Code

Most code is self-documenting through names. Comments appear mainly for:

- complex event/projection ordering
- route numbering in templates
- security scanner rationale
- workflow template algorithm explanations

Avoid adding broad narrative comments when local names already describe behavior.

## Current Formatting Gaps

There is no configured ESLint, Prettier, Biome, or root typecheck command. Some files show style drift in spacing or long lines, for example `apps/control-plane/src/routes/templates.ts` and `apps/web/src/lib/api.ts`.

For future changes, match nearby code first and keep formatting minimal unless a formatter is introduced intentionally.

