# Architecture

**Analysis Date:** 2026-05-04

## System Shape

`feudal-coding-agents` is a pnpm monorepo for a local governance console around AI coding workflows.

The implemented runtime is:
- `apps/web`: browser operator console.
- `apps/control-plane`: task truth, governance, replay, analytics, alerts, templates, plugins, RBAC, and orchestration API.
- `apps/acp-gateway`: ACP run lifecycle, worker execution, agent registry, messaging, health, failover, scheduling, and gateway-side plugin adapters.
- `packages/contracts`: shared Zod schemas and TypeScript contracts.
- `packages/orchestrator`: deterministic task state machine.
- `packages/acp`: ACP protocol and client abstractions.
- `packages/persistence`: optional PostgreSQL event store and migrations.

The core architecture is control-plane / execution-plane separation with explicit state-machine transitions and optional event-sourced persistence.

## Runtime Boundaries

### Web Console Boundary

`apps/web/src/app.tsx` is a composition shell. It renders panels and delegates state to `apps/web/src/hooks/use-task-console.ts`.

Browser API boundaries are separated into:
- `apps/web/src/lib/api.ts`: raw HTTP client calls.
- `apps/web/src/lib/console-data.ts`: bootstrap and contextual data loading.
- `apps/web/src/lib/console-actions.ts`: task, governance, and operator mutations.
- `apps/web/src/lib/task-lanes.ts`: status lane labels and ordering.
- `apps/web/src/lib/workflow-phase.ts`: workflow phase display helpers.
- `apps/web/src/hooks/use-analytics.ts`: analytics/alert data loading.

The web app does not import backend services directly. Future UI code should continue going through `apps/web/src/lib/api.ts`.

### Control Plane Boundary

`apps/control-plane/src/server.ts` is the Fastify entry point and route registration surface.

`apps/control-plane/src/services/orchestrator-service.ts` is the task orchestration facade. It composes:
- `TaskCoordinator` from `apps/control-plane/src/services/task-coordinator.ts`
- `GovernanceCoordinator` from `apps/control-plane/src/services/governance-coordinator.ts`
- `OperatorCoordinator` from `apps/control-plane/src/services/operator-coordinator.ts`
- `ReplayCoordinator` from `apps/control-plane/src/services/replay-coordinator.ts`

Shared orchestration helpers live in:
- `apps/control-plane/src/services/orchestrator-flows.ts`
- `apps/control-plane/src/services/orchestrator-runtime.ts`
- `apps/control-plane/src/services/orchestrator-types.ts`
- `apps/control-plane/src/services/task-metadata.ts`
- `apps/control-plane/src/services/task-run-gateway.ts`

The control plane owns task lifecycle truth and should remain the only writer for task state transitions.

### ACP Gateway Boundary

`apps/acp-gateway/src/server.ts` is the Fastify entry point for execution-plane runtime.

The gateway owns:
- run state writes through `apps/acp-gateway/src/store.ts` and `apps/acp-gateway/src/persistence/run-read-model.ts`
- worker execution through `apps/acp-gateway/src/workers/worker-runner.ts`
- local Codex CLI execution through `apps/acp-gateway/src/codex/exec.ts`
- runtime agent manifests through `apps/acp-gateway/src/manifests.ts`
- registry, discovery, messaging, health, failover, and scheduling modules under `apps/acp-gateway/src/agent-*`

The default registry, messaging, health, failover, and scheduler objects are process-local unless explicit stores are added.

## Main Task Flow

The nominal task flow is:
1. User submits a task through `apps/web/src/components/new-task-panel.tsx`.
2. `apps/web/src/lib/api.ts` posts to `POST /api/tasks`.
3. `apps/control-plane/src/routes/tasks.ts` validates the request with `TaskSpecSchema`.
4. `TaskCoordinator.createTask()` creates the task and transitions through intake.
5. `runPlanningReviewAndBranch()` runs planning and review agents.
6. If enabled in gateway manifests, `fact-checker-agent` runs between planning and review.
7. `aggregateReviewVerdict()` in `apps/control-plane/src/governance/policy.ts` decides approve, reject, or revise.
8. Approval-gated tasks enter `awaiting_approval`.
9. Approved or approval-free tasks enter execution via `runExecutionAndVerification()`.
10. Control plane creates an `assignment` artifact from prompt, decision brief, and optional fact check.
11. `gongbu-executor` runs execution through the ACP gateway.
12. `scanExecutionArtifacts()` blocks unsafe execution artifacts before verification.
13. `xingbu-verifier` decides completed, partial success, or failed.
14. Web console reloads projections, artifacts, runs, events, diffs, and replay data.

Legal state transitions are enforced by `packages/orchestrator/src/task-machine.ts`.

## State and Contracts

`packages/contracts/src/index.ts` defines:
- `TaskRecord`
- `TaskProjection`
- `RunProjection`
- `RecoverySummary`
- `ACPRunSummary`
- governance, operator action, token usage, and workflow phase schemas

`deriveWorkflowPhase()` derives display phase from status and recovery metadata. `status` is lifecycle truth; `workflowPhase` is an explanation layer for UI and operator context.

Analytics contracts live in `packages/contracts/src/analytics/types.ts`.

Plugin contracts live in:
- `packages/contracts/src/plugins/types.ts`
- `packages/contracts/src/plugins/sdk.ts`

Governance contracts live in:
- `packages/contracts/src/governance/rbac.ts`
- `packages/contracts/src/governance/rule-engine.ts`
- `packages/contracts/src/governance/auto-approval.ts`

## Persistence and Replay

Shared event-store infrastructure lives in `packages/persistence/src/event-store.ts`.

Control-plane task persistence uses:
- `apps/control-plane/src/persistence/task-event-codec.ts`
- `apps/control-plane/src/persistence/task-read-model.ts`

ACP gateway run persistence uses:
- `apps/acp-gateway/src/persistence/run-event-codec.ts`
- `apps/acp-gateway/src/persistence/run-read-model.ts`

When `DATABASE_URL` is absent:
- `apps/control-plane/src/store.ts` provides `MemoryTaskStore`.
- `apps/acp-gateway/src/store.ts` provides `GatewayStore`.

Replay and recovery routes are exposed by `apps/control-plane/src/routes/replay.ts`.

## Governance Architecture

Governance has multiple layers:
- review aggregation policy in `apps/control-plane/src/governance/policy.ts`
- complexity scoring in `apps/control-plane/src/governance/complexity-scorer.ts`
- auto-approval logic in `apps/control-plane/src/governance/auto-approval.ts`
- RBAC policy and middleware in `apps/control-plane/src/governance/rbac-policy.ts` and `apps/control-plane/src/governance/rbac-middleware.ts`
- role APIs in `apps/control-plane/src/routes/roles.ts`

Governance actions are `approve`, `reject`, and `revise`.

Operator actions are separate: `recover`, `takeover`, and `abandon`. Their policy and coordination live in:
- `apps/control-plane/src/operator-actions/policy.ts`
- `apps/control-plane/src/services/operator-coordinator.ts`
- `apps/control-plane/src/routes/operator-actions.ts`

Keep governance actions and operator actions separate in future features.

## ACP Runtime Architecture

Runtime workers are declared in:
- `apps/acp-gateway/src/manifests.ts`
- `apps/acp-gateway/src/workers/types.ts`

Required workers:
- `intake-agent`
- `analyst-agent`
- `auditor-agent`
- `critic-agent`
- `gongbu-executor`
- `xingbu-verifier`

Optional worker:
- `fact-checker-agent`

`apps/acp-gateway/src/workers/registry.ts` maps each worker to an artifact name, output schema, prompt renderer, and parser.

`apps/acp-gateway/src/routes/runs.ts` manages run creation, await gates, await responses, cancellation, and run lookup.

## Agent Coordination Architecture

Agent registry:
- `apps/acp-gateway/src/agent-registry/types.ts`
- `apps/acp-gateway/src/agent-registry/registry.ts`
- `apps/acp-gateway/src/agent-registry/discovery.ts`
- `apps/acp-gateway/src/agent-registry/seed.ts`

Messaging:
- `apps/acp-gateway/src/agent-protocol/types.ts`
- `apps/acp-gateway/src/agent-protocol/json-rpc.ts`
- `apps/acp-gateway/src/agent-protocol/message-router.ts`

Health and failover:
- `apps/acp-gateway/src/agent-health/types.ts`
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`

Scheduling:
- `apps/acp-gateway/src/agent-scheduler/types.ts`
- `apps/acp-gateway/src/agent-scheduler/scheduler.ts`
- `apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.ts`
- `apps/acp-gateway/src/routes/agent-scheduler.ts`

These modules are implemented and route-wired, but default state is in-process.

## Template, Plugin, Analytics, and Alert Architecture

Workflow templates:
- `apps/control-plane/src/services/workflow-template-types.ts`
- `apps/control-plane/src/services/workflow-template-store.ts`
- `apps/control-plane/src/services/workflow-template-engine.ts`
- `apps/control-plane/src/routes/templates.ts`

Plugins:
- `apps/control-plane/src/services/plugin-discovery.ts`
- `apps/control-plane/src/services/plugin-store.ts`
- `apps/control-plane/src/services/plugin-extension-catalog.ts`
- `apps/control-plane/src/services/plugin-marketplace.ts`
- `apps/control-plane/src/services/plugin-security-policy.ts`
- `apps/control-plane/src/routes/plugins.ts`
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`

Analytics and alerts:
- `apps/control-plane/src/services/metrics-service.ts`
- `apps/control-plane/src/services/analytics-service.ts`
- `apps/control-plane/src/services/alert-service.ts`
- `apps/control-plane/src/routes/metrics.ts`
- `apps/control-plane/src/routes/analytics.ts`
- `apps/control-plane/src/routes/alerts.ts`
- `apps/web/src/components/analytics-dashboard.tsx`
- `apps/web/src/components/audit-trail-viewer.tsx`
- `apps/web/src/components/alert-panel.tsx`

## Architectural Hotspots

- `apps/control-plane/src/persistence/task-read-model.ts` remains a large module that mixes projection writes, reads, replay helpers, recovery summaries, artifacts, runs, and operator action mapping.
- `apps/web/src/hooks/use-task-console.ts` is the main UI state hotspot.
- `apps/control-plane/src/services/orchestrator-flows.ts` is the key orchestration hotspot; changes here affect planning, review, security scanning, execution, and verification.
- `apps/acp-gateway/src/routes/runs.ts` is the key ACP run lifecycle route.
- Plugin marketplace and security are intentionally local trusted-plugin semantics, not remote untrusted extension execution.

---

*Architecture analysis: 2026-05-04*
