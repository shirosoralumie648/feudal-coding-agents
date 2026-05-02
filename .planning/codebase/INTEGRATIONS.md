# Integrations

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## Summary

The repository mostly integrates internally: browser to control plane, control plane to ACP gateway, ACP gateway to local Codex CLI, and both backend apps optionally to Postgres. There are no third-party SaaS SDKs, auth providers, payment processors, webhook receivers, or external API domains beyond the generic ACP HTTP target.

## Browser to Control Plane

`apps/web/src/lib/api.ts` is the browser API client. It uses `fetch` against relative `/api/*` paths.

Primary calls:

- `fetchTasks()` -> `GET /api/tasks`
- `createTask()` -> `POST /api/tasks`
- `submitGovernanceAction()` -> `POST /api/tasks/:taskId/governance-actions/:actionType`
- `recoverTask()` -> `POST /api/tasks/:taskId/operator-actions/recover`
- `takeoverTask()` -> `POST /api/tasks/:taskId/operator-actions/takeover`
- `abandonTask()` -> `POST /api/tasks/:taskId/operator-actions/abandon`
- `fetchTaskEvents()` -> `GET /api/tasks/:taskId/events`
- `fetchTaskDiffs()` -> `GET /api/tasks/:taskId/diffs`
- `fetchTaskReplay()` -> `GET /api/tasks/:taskId/replay?asOfEventId=...`
- `fetchOperatorSummary()` -> `GET /api/operator-actions/summary`
- `fetchRecoverySummary()` -> `GET /api/recovery/summary`

`apps/web/vite.config.ts` proxies `/api` to `http://127.0.0.1:4000` for local development and preview.

## Control Plane HTTP API

`apps/control-plane/src/server.ts` registers these route modules:

- `apps/control-plane/src/routes/agents.ts`
- `apps/control-plane/src/routes/tasks.ts`
- `apps/control-plane/src/routes/templates.ts`
- `apps/control-plane/src/routes/operator-actions.ts`
- `apps/control-plane/src/routes/replay.ts`
- `apps/control-plane/src/routes/metrics.ts`

Task routes in `apps/control-plane/src/routes/tasks.ts` expose task creation, listing, lookup, and governance actions.

Operator routes in `apps/control-plane/src/routes/operator-actions.ts` expose `recover`, `takeover`, and `abandon` with explicit note validation.

Replay routes in `apps/control-plane/src/routes/replay.ts` expose events, diffs, task runs, artifacts, point-in-time replay, and recovery summary.

Template routes in `apps/control-plane/src/routes/templates.ts` expose CRUD, publish/unpublish, export/import history, and instantiation routes for in-memory workflow templates.

Metrics routes in `apps/control-plane/src/routes/metrics.ts` expose:

- `GET /metrics`
- `GET /metrics/tokens`
- `GET /metrics/health`

Current `createControlPlaneApp()` calls `registerMetricsRoutes(app)` without a store option, so the aggregate `/metrics` endpoint reports unavailable unless wired differently.

## Control Plane to ACP Gateway

`apps/control-plane/src/config.ts` builds ACP clients from environment:

- `ACP_BASE_URL` defaults to `http://127.0.0.1:4100`.
- `FEUDAL_ACP_MODE=mock` returns `createMockACPClient()`.
- default mode uses `createHttpACPClient({ baseUrl })`.

`packages/acp/src/http-client.ts` maps ACP operations to gateway endpoints:

- `listAgents()` -> `GET /agents`
- `runAgent()` -> `POST /runs` with `{ kind: "agent-run" }`
- `awaitExternalInput()` -> `POST /runs` with `{ kind: "await" }`
- `respondToAwait()` -> `POST /runs/:runId`
- `getRun()` -> `GET /runs/:runId`

`apps/control-plane/src/services/task-run-gateway.ts` wraps the real and mock ACP clients. It supports `real`, `real_with_mock_fallback`, and `mock_fallback_used` execution modes.

## ACP Gateway API

`apps/acp-gateway/src/server.ts` registers:

- `apps/acp-gateway/src/routes/agents.ts`
- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/agent-messaging.ts`
- `apps/acp-gateway/src/routes/agent-health.ts`

Run endpoints in `apps/acp-gateway/src/routes/runs.ts` include:

- `POST /runs`
- `GET /runs/:runId`
- `POST /runs/:runId`
- `POST /runs/:runId/cancel`

Agent registry endpoints in `apps/acp-gateway/src/routes/agent-registry.ts` include registration, lookup, list/query, status updates, and discovery.

Agent messaging endpoints in `apps/acp-gateway/src/routes/agent-messaging.ts` provide direct, broadcast, capability-routed messages, and mailbox reads.

Agent health endpoints in `apps/acp-gateway/src/routes/agent-health.ts` provide heartbeats, active probes, event reads, and failover triggers.

## Local Codex CLI Execution

`apps/acp-gateway/src/codex/exec.ts` bridges gateway worker execution to the local `codex` CLI.

The runner:

- writes a JSON schema into a temporary directory
- calls `codex exec --full-auto --skip-git-repo-check --cd <repoRoot>`
- passes `--output-schema` and `--output-last-message`
- reads the output JSON back from the temporary file
- deletes the temporary directory afterward

This is a local process integration through `node:child_process.execFile`, not an HTTP API integration.

Worker prompts and output schemas live in:

- `apps/acp-gateway/src/workers/registry.ts`
- `apps/acp-gateway/src/workers/prompt-templates.ts`
- `apps/acp-gateway/src/workers/json-schemas.ts`

## Database Integration

Postgres is optional and controlled by `DATABASE_URL`.

If `DATABASE_URL` is present:

- `apps/control-plane/src/config.ts` creates a Postgres pool, runs migrations, creates an event store, and returns `createTaskReadModel()`.
- `apps/acp-gateway/src/server.ts` creates a Postgres pool, runs migrations, creates an event store, and returns `createRunReadModel()`.

If `DATABASE_URL` is absent:

- control-plane uses `MemoryTaskStore` from `apps/control-plane/src/store.ts`.
- ACP gateway uses `GatewayStore` from `apps/acp-gateway/src/store.ts`.

The shared event store is in `packages/persistence/src/event-store.ts`.

## Persistence Tables

`packages/persistence/src/migrations.ts` creates idempotent DDL for:

- `event_log`: append-only event stream with optimistic event versions
- `projection_checkpoint`: projection rebuild checkpoints
- `tasks_current`: current task projection rows
- `task_history_entries`: task history projection rows
- `runs_current`: current run projection rows
- `artifacts_current`: task artifact projection rows
- `operator_actions`: operator action audit records

Tests use `pg-mem` in files such as `packages/persistence/src/event-store.test.ts`, `apps/control-plane/src/persistence/task-read-model.test.ts`, and `apps/acp-gateway/src/persistence/run-read-model.test.ts`.

## CI and Browser Integration

`.github/workflows/ci.yml` runs:

- dependency install through pnpm
- Playwright Chromium install
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

`apps/web/playwright.config.ts` starts:

- control-plane on port `4000` with `FEUDAL_ACP_MODE=mock`
- web preview on port `4173`

## Authentication, Webhooks, and External Providers

No current runtime auth provider is wired into `apps/control-plane/src/server.ts` or `apps/acp-gateway/src/server.ts`.

RBAC contract and policy modules exist under `packages/contracts/src/governance/` and `apps/control-plane/src/governance/`, and role route code exists in `apps/control-plane/src/routes/roles.ts`, but `registerRoleRoutes()` is not registered in `apps/control-plane/src/server.ts`.

No webhook routes were found. No Stripe, OAuth, OpenAI SDK, Anthropic SDK, cloud SDK, Redis, queue, or object storage client is present in package manifests.

