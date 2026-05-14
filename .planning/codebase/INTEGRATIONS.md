# Integrations

**Analysis Date:** 2026-05-04

## Summary

The repository is mostly self-contained. Runtime integrations are browser-to-control-plane HTTP, control-plane-to-ACP-gateway HTTP, ACP-gateway-to-local Codex CLI process execution, optional PostgreSQL persistence, local trusted plugin discovery, and optional alert webhooks.

No current package manifest declares Stripe, OAuth/OIDC, OpenAI SDK, Anthropic SDK, AWS/GCP/Azure SDK, Redis, queue, object storage, or email providers.

## Browser to Control Plane

`apps/web/src/lib/api.ts` is the browser API client. It uses `fetch` against relative paths and relies on the Vite proxy in `apps/web/vite.config.ts` during local development.

Primary browser-facing surfaces:
- Task list/create/detail and governance actions through `apps/control-plane/src/routes/tasks.ts`.
- Operator action summary and task-scoped operator actions through `apps/control-plane/src/routes/operator-actions.ts`.
- Replay, diffs, runs, artifacts, and recovery summary through `apps/control-plane/src/routes/replay.ts`.
- Analytics snapshot, stream, and audit trail through `apps/control-plane/src/routes/analytics.ts`.
- Alerts through `apps/control-plane/src/routes/alerts.ts`.
- Plugins and local marketplace through `apps/control-plane/src/routes/plugins.ts`.
- RBAC role and assignment management through `apps/control-plane/src/routes/roles.ts`.

Local web development:
- `apps/web/vite.config.ts` proxies `/api` to `http://127.0.0.1:4000`.
- `apps/web/playwright.config.ts` uses `http://127.0.0.1:4173` for browser tests.

## Control Plane HTTP API

`apps/control-plane/src/server.ts` registers the control-plane API modules:
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

The control plane is the authoritative API boundary for the web console. UI code should keep using `apps/web/src/lib/api.ts` instead of importing backend modules.

## Control Plane to ACP Gateway

`apps/control-plane/src/config.ts` builds the ACP client:
- `ACP_BASE_URL` defaults to `http://127.0.0.1:4100`.
- `FEUDAL_ACP_MODE=mock` returns `createMockACPClient()`.
- Default mode returns `createHttpACPClient({ baseUrl })`.

`packages/acp/src/http-client.ts` maps client operations to gateway endpoints:
- `listAgents()` -> `GET /agents`
- `runAgent()` -> `POST /runs`
- `awaitExternalInput()` -> `POST /runs`
- `respondToAwait()` -> `POST /runs/:runId`
- `getRun()` -> `GET /runs/:runId`

`apps/control-plane/src/services/task-run-gateway.ts` handles real ACP, mock mode, and mock fallback behavior. Tests in `apps/control-plane/src/services/task-run-gateway.test.ts` cover fallback latching.

## ACP Gateway API

`apps/acp-gateway/src/server.ts` registers these gateway modules:
- `apps/acp-gateway/src/routes/agents.ts`
- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/agent-messaging.ts`
- `apps/acp-gateway/src/routes/agent-health.ts`
- `apps/acp-gateway/src/routes/agent-scheduler.ts`

Run endpoints in `apps/acp-gateway/src/routes/runs.ts` manage:
- run creation
- run lookup
- await response submission
- cancellation

Agent coordination endpoints expose:
- registry registration, lookup, listing, status updates, and discovery in `apps/acp-gateway/src/routes/agent-registry.ts`
- direct, broadcast, capability-routed messages, and mailbox reads in `apps/acp-gateway/src/routes/agent-messaging.ts`
- heartbeat, probe, health event, and failover operations in `apps/acp-gateway/src/routes/agent-health.ts`
- scheduler assignment, load, bottleneck, and release operations in `apps/acp-gateway/src/routes/agent-scheduler.ts`

## Local Codex CLI Execution

`apps/acp-gateway/src/codex/exec.ts` bridges worker execution to the local `codex` CLI with `node:child_process.execFile`.

The runner:
- writes a JSON schema to a temporary directory
- calls `codex exec --full-auto --skip-git-repo-check --cd <repoRoot>`
- passes `--output-schema` and `--output-last-message`
- reads the output JSON from the temporary file
- deletes the temporary directory after execution

Worker prompts and output schemas live in:
- `apps/acp-gateway/src/workers/registry.ts`
- `apps/acp-gateway/src/workers/prompt-templates.ts`
- `apps/acp-gateway/src/workers/json-schemas.ts`

This is a local process integration, not a SaaS API integration.

## Database Integration

PostgreSQL is optional and controlled by `DATABASE_URL`.

If `DATABASE_URL` is present:
- `apps/control-plane/src/config.ts` creates a pool, runs migrations, creates an event store, and returns `createTaskReadModel()`.
- `apps/acp-gateway/src/server.ts` creates a pool, runs migrations, creates an event store, and returns `createRunReadModel()`.

If `DATABASE_URL` is absent:
- control plane uses `MemoryTaskStore` from `apps/control-plane/src/store.ts`.
- ACP gateway uses `GatewayStore` from `apps/acp-gateway/src/store.ts`.

Shared persistence code:
- `packages/persistence/src/postgres.ts`
- `packages/persistence/src/migrations.ts`
- `packages/persistence/src/event-store.ts`

The migration creates the append-only event log, projection checkpoint, task/run current tables, artifact projections, and operator action records.

## Analytics and Alerts

Analytics:
- Contracts live in `packages/contracts/src/analytics/types.ts`.
- Metrics aggregation lives in `apps/control-plane/src/services/metrics-service.ts`.
- Snapshot polling, audit-event loading, and optional analytics event persistence live in `apps/control-plane/src/services/analytics-service.ts`.
- HTTP and streaming surfaces live in `apps/control-plane/src/routes/analytics.ts` and `apps/control-plane/src/routes/metrics.ts`.
- UI surfaces are `apps/web/src/components/analytics-dashboard.tsx` and `apps/web/src/components/audit-trail-viewer.tsx`.

Alerts:
- Rule config defaults live in `apps/control-plane/config/alert-rules.json`.
- Alert evaluation and optional webhook delivery live in `apps/control-plane/src/services/alert-service.ts`.
- Routes live in `apps/control-plane/src/routes/alerts.ts`.
- UI surface is `apps/web/src/components/alert-panel.tsx`.
- `ALERT_WEBHOOK_URL` enables webhook delivery; without it, alerts remain local/in-app.

Token usage:
- Token contracts exist in `packages/contracts/src/index.ts`.
- `apps/control-plane/src/services/analytics-service.ts` currently returns zero token usage from `computeTokenUsage()`.
- Treat cost accounting as a contract placeholder until real runner token metadata is recorded.

## Plugin Integration

Plugins are local, trusted manifests, not remote packages.

Contracts and SDK:
- `packages/contracts/src/plugins/types.ts`
- `packages/contracts/src/plugins/sdk.ts`
- `docs/plugins/sdk.md`

Control-plane services:
- `apps/control-plane/src/services/plugin-discovery.ts`
- `apps/control-plane/src/services/plugin-store.ts`
- `apps/control-plane/src/services/plugin-extension-catalog.ts`
- `apps/control-plane/src/services/plugin-marketplace.ts`
- `apps/control-plane/src/services/plugin-security-policy.ts`

Routes:
- `apps/control-plane/src/routes/plugins.ts`

ACP gateway adapter:
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`

Example plugin:
- `plugins/examples/code-review-bot/plugin.json`
- `plugins/examples/code-review-bot/src/index.ts`

`FEUDAL_PLUGIN_DIRS` controls discovery roots. Remote install, dependency installation, and untrusted sandboxing are out of current runtime scope.

## CI and Browser Integration

`.github/workflows/ci.yml` runs dependency install, Playwright Chromium installation, `pnpm test`, `pnpm build`, and `pnpm e2e`.

`apps/web/playwright.config.ts` starts:
- control plane on port 4000 with `FEUDAL_ACP_MODE=mock`
- web preview on port 4173

## Authentication and External Providers

Local RBAC routes and policies exist in:
- `apps/control-plane/src/routes/roles.ts`
- `apps/control-plane/src/governance/rbac-policy.ts`
- `apps/control-plane/src/governance/rbac-middleware.ts`
- `packages/contracts/src/governance/rbac.ts`

No current public identity provider, session provider, OAuth callback, SSO, or multi-tenant authentication boundary is wired into `apps/control-plane/src/server.ts` or `apps/acp-gateway/src/server.ts`.

## Security Notes

- Do not read or copy `.env` contents; no `.env` files were detected in the root scan for this mapping pass.
- Plugin security review is local policy evaluation over declared permissions.
- Execution artifact scanning is wired through `scanExecutionArtifacts()` in `apps/control-plane/src/services/orchestrator-flows.ts`.

---

*Integration analysis: 2026-05-04*
