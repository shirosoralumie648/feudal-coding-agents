# Architecture

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## System Shape

Feudal Coding Agents is a pnpm monorepo implementing a local governance console for AI coding workflows.

The implemented architecture is:

1. `apps/web`: operator-facing React console.
2. `apps/control-plane`: task truth, governance, replay, templates, and orchestration API.
3. `apps/acp-gateway`: ACP run lifecycle, agent registry, health, message routing, and worker execution boundary.
4. `packages/contracts`: shared schemas and API/read-model contracts.
5. `packages/orchestrator`: deterministic task state machine.
6. `packages/acp`: ACP protocol and client abstractions.
7. `packages/persistence`: optional Postgres event store and migrations.

The strongest architectural pattern is control-plane / execution-plane separation with event-sourced persistence and explicit workflow state transitions.

## Runtime Boundaries

### Web Console Boundary

`apps/web/src/app.tsx` composes panels and delegates state to `apps/web/src/hooks/use-task-console.ts`.

Data loading is split into:

- `apps/web/src/lib/api.ts`: raw HTTP calls.
- `apps/web/src/lib/console-data.ts`: bootstrap and contextual data loading.
- `apps/web/src/lib/console-actions.ts`: task, governance, and operator mutations.
- `apps/web/src/lib/task-lanes.ts`: status lane labels.
- `apps/web/src/lib/workflow-phase.ts`: workflow phase display helpers.

The web app does not import backend services directly; it uses HTTP through relative `/api` paths.

### Control Plane Boundary

`apps/control-plane/src/server.ts` is the Fastify entry point. It owns task truth and exposes APIs for the web console.

`apps/control-plane/src/services/orchestrator-service.ts` is a facade. It composes:

- `TaskCoordinator` from `apps/control-plane/src/services/task-coordinator.ts`
- `GovernanceCoordinator` from `apps/control-plane/src/services/governance-coordinator.ts`
- `OperatorCoordinator` from `apps/control-plane/src/services/operator-coordinator.ts`
- `ReplayCoordinator` from `apps/control-plane/src/services/replay-coordinator.ts`

Shared orchestration helpers are in:

- `apps/control-plane/src/services/orchestrator-flows.ts`
- `apps/control-plane/src/services/orchestrator-runtime.ts`
- `apps/control-plane/src/services/task-metadata.ts`
- `apps/control-plane/src/services/task-run-gateway.ts`

### ACP Gateway Boundary

`apps/acp-gateway/src/server.ts` is the Fastify entry point for run execution.

The gateway owns:

- run state and run projection writes through `apps/acp-gateway/src/store.ts` and `apps/acp-gateway/src/persistence/run-read-model.ts`
- worker execution through `apps/acp-gateway/src/workers/worker-runner.ts`
- local Codex CLI integration through `apps/acp-gateway/src/codex/exec.ts`
- runtime agent manifests through `apps/acp-gateway/src/manifests.ts`
- agent registry, discovery, messaging, health, and failover modules under `apps/acp-gateway/src/agent-*`

## Main Task Flow

The nominal flow starts in the browser and returns to the browser as projected task state.

1. User submits a task through `apps/web/src/components/new-task-panel.tsx`.
2. `apps/web/src/lib/api.ts` posts to `POST /api/tasks`.
3. `apps/control-plane/src/routes/tasks.ts` validates with `TaskSpecSchema`.
4. `TaskCoordinator.createTask()` creates a draft projection and transitions to `intake`.
5. `TaskCoordinator` runs `intake-agent`.
6. `runPlanningReviewAndBranch()` runs `analyst-agent`.
7. If enabled in manifests, `fact-checker-agent` runs before review.
8. `auditor-agent` and `critic-agent` run review steps.
9. `aggregateReviewVerdict()` in `apps/control-plane/src/governance/policy.ts` decides approve, reject, or needs revision.
10. If approval is required, the task becomes `awaiting_approval`.
11. If approval is skipped or later granted, `runExecutionAndVerification()` creates an `assignment` artifact, runs `gongbu-executor`, then runs `xingbu-verifier`.
12. The final verifier result transitions the task to `completed`, `partial_success`, or `failed`.

The task state machine used by these steps is `packages/orchestrator/src/task-machine.ts`.

## State and Projection Model

`packages/contracts/src/index.ts` defines:

- `TaskRecord`: business task snapshot.
- `TaskProjection`: task snapshot plus recovery/projection metadata.
- `RunProjection`: run snapshot plus recovery/projection metadata.
- `RecoverySummary`: aggregate recovery counts.
- `ACPRunSummary`: compact run data embedded in tasks.

`deriveWorkflowPhase()` in `packages/contracts/src/index.ts` derives a display phase from task status and recovery state. `status` remains the lifecycle truth; `workflowPhase` is a derived explanation layer.

## Event Sourcing

The shared Postgres event store is in `packages/persistence/src/event-store.ts`.

Control-plane task persistence uses:

- `apps/control-plane/src/persistence/task-event-codec.ts`
- `apps/control-plane/src/persistence/task-read-model.ts`

ACP gateway run persistence uses:

- `apps/acp-gateway/src/persistence/run-event-codec.ts`
- `apps/acp-gateway/src/persistence/run-read-model.ts`

When no `DATABASE_URL` is present, both apps fall back to in-memory stores:

- `MemoryTaskStore` in `apps/control-plane/src/store.ts`
- `GatewayStore` in `apps/acp-gateway/src/store.ts`

## Governance Architecture

Governance has several layers:

- Simple task governance policy in `apps/control-plane/src/governance/policy.ts`
- Complexity scoring in `apps/control-plane/src/governance/complexity-scorer.ts`
- Auto approval engine in `apps/control-plane/src/governance/auto-approval.ts`
- RBAC policy and middleware in `apps/control-plane/src/governance/rbac-policy.ts` and `apps/control-plane/src/governance/rbac-middleware.ts`
- Contract schemas under `packages/contracts/src/governance/`

Current route registration wires task governance actions through `apps/control-plane/src/routes/tasks.ts`. Role routes exist in `apps/control-plane/src/routes/roles.ts`, but they are not registered by `apps/control-plane/src/server.ts`.

## Operator and Recovery Architecture

Operator actions are distinct from governance actions.

Governance actions:

- `approve`
- `reject`
- `revise`

Operator actions:

- `recover`
- `takeover`
- `abandon`

Operator action policy is in `apps/control-plane/src/operator-actions/policy.ts`. Operator coordination is in `apps/control-plane/src/services/operator-coordinator.ts`.

Recovery and replay views are exposed through `apps/control-plane/src/routes/replay.ts` and backed by task/read-model query methods.

## ACP Runtime Architecture

Runtime workers are statically declared in `apps/acp-gateway/src/manifests.ts` and `apps/acp-gateway/src/workers/types.ts`.

Required workers:

- `intake-agent`
- `analyst-agent`
- `auditor-agent`
- `critic-agent`
- `gongbu-executor`
- `xingbu-verifier`

Optional worker:

- `fact-checker-agent`

`apps/acp-gateway/src/workers/registry.ts` maps each worker to:

- an artifact name
- an output JSON schema
- a prompt renderer
- a Zod parser for returned JSON

`apps/acp-gateway/src/routes/runs.ts` manages run creation, await gates, await responses, and cancellation.

## Agent Registry, Messaging, and Health

Agent registry:

- types: `apps/acp-gateway/src/agent-registry/types.ts`
- state/event logic: `apps/acp-gateway/src/agent-registry/registry.ts`
- discovery: `apps/acp-gateway/src/agent-registry/discovery.ts`
- seed conversion: `apps/acp-gateway/src/agent-registry/seed.ts`

Messaging:

- JSON-RPC envelope helpers in `apps/acp-gateway/src/agent-protocol/json-rpc.ts`
- in-memory mailbox routing in `apps/acp-gateway/src/agent-protocol/message-router.ts`

Health:

- heartbeat state machine in `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- failover assignment tracking in `apps/acp-gateway/src/agent-health/failover-handler.ts`

These modules are implemented, but their state is process-local unless a concrete store is injected. They are not yet a distributed runtime registry.

## Template Architecture

Workflow template support lives in:

- `apps/control-plane/src/services/workflow-template-types.ts`
- `apps/control-plane/src/services/workflow-template-store.ts`
- `apps/control-plane/src/services/workflow-template-engine.ts`
- `apps/control-plane/src/routes/templates.ts`

The default template store is `MemoryTemplateStore` from `apps/control-plane/src/config.ts`. Template routes support optimistic `if-match` style updates. Instantiation currently creates normal tasks through `defaultOrchestratorService`.

## Architectural Tensions

- `apps/control-plane/src/persistence/task-read-model.ts` is large and mixes projection writes, query helpers, replay, recovery summaries, and operator action mapping.
- `apps/web/src/hooks/use-task-console.ts` centralizes many independent UI state concerns.
- `apps/control-plane/src/routes/roles.ts` and RBAC modules exist but are not wired into the main Fastify app.
- `apps/control-plane/src/routes/metrics.ts` has useful code paths, but `/metrics` is registered without a store in the default server.
- `apps/acp-gateway/src/agent-registry/registry.ts`, `HeartbeatMonitor`, and `AgentMessageRouter` are process-local by default, so "registry" and "messaging" should be treated as local runtime capabilities unless persistence is explicitly added.

