# Testing

**Analysis Date:** 2026-05-04

## Test Stack

The repository uses:
- Vitest for unit and integration tests.
- jsdom and Testing Library for React tests.
- Playwright for browser E2E.
- pg-mem for Postgres-like persistence tests.

Primary commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

`README.md` lists `pnpm test`, `pnpm build`, `pnpm e2e`, and `pnpm db:migrate`. `.planning/STATE.md` records the latest closure verification as `pnpm typecheck`, `pnpm test -- --pool=forks`, `pnpm build`, and `git diff --check` passing on 2026-05-04.

## Vitest Workspace

`vitest.config.ts` defines projects for:
- `packages/contracts`
- `packages/orchestrator`
- `packages/acp`
- `packages/persistence`
- `apps/acp-gateway`
- `apps/control-plane`
- `apps/web`

Each app/package also exposes a local `test` script in its own `package.json`.

Current checkout contains 64 test/E2E files under `apps` and `packages`.

## Typecheck Gate

Root `package.json` defines:

```bash
pnpm typecheck
```

The command runs `tsc -p tsconfig.typecheck.json --noEmit --pretty false`.

`tsconfig.typecheck.json` includes app/package implementation files and excludes:
- `node_modules`
- `dist`
- `coverage`
- `test-results`
- `playwright-report`
- `.worktrees`
- `**/*.test.ts`
- `**/*.test.tsx`
- `**/e2e/**`

Use this gate for shared contract, backend, and non-web build changes where Vite build alone is not enough.

## Test Placement

Tests are colocated:
- `packages/*/src/*.test.ts`
- `apps/control-plane/src/**/*.test.ts`
- `apps/acp-gateway/src/**/*.test.ts`
- `apps/web/src/*.test.tsx`
- `apps/web/src/hooks/*.test.ts`
- `apps/web/src/lib/*.test.ts`
- `apps/web/e2e/*.spec.ts`

Examples:
- `packages/contracts/src/index.test.ts`
- `packages/contracts/src/plugins/types.test.ts`
- `packages/contracts/src/analytics/types.test.ts`
- `packages/orchestrator/src/task-machine.test.ts`
- `packages/acp/src/http-client.test.ts`
- `packages/persistence/src/event-store.test.ts`
- `apps/control-plane/src/routes/tasks.test.ts`
- `apps/acp-gateway/src/routes/runs.test.ts`
- `apps/web/src/app.test.tsx`

## Contracts Tests

`packages/contracts/src/index.test.ts` covers:
- task specs and statuses
- governance metadata
- operator action records and summaries
- recovery state metadata
- task and run projections
- workflow phase derivation
- token usage contracts

Plugin contracts are covered by `packages/contracts/src/plugins/types.test.ts`.

Analytics contracts are covered by `packages/contracts/src/analytics/types.test.ts`.

Governance subcontracts are exercised by control-plane governance tests and consumers under `apps/control-plane/src/governance/*.test.ts`.

## State Machine Tests

`packages/orchestrator/src/task-machine.test.ts` covers legal and illegal task transitions for:
- intake/planning/review
- approval gates
- execution and verification
- revision
- operator recovery
- takeover
- abandon

This package is small and high-value because services depend on `transitionTask()` for lifecycle legality.

## ACP Client Tests

`packages/acp/src/mock-client.test.ts` covers:
- manifest listing
- approval await/resume
- prompt-marker review behavior
- execution and verification mock outputs
- unknown agent errors

`packages/acp/src/http-client.test.ts` stubs `fetch` and checks request paths, bodies, response parsing, and error behavior.

## Persistence Tests

`packages/persistence/src/event-store.test.ts` uses `pg-mem` to verify:
- migration creation
- append ordering
- safe int8 parsing
- optimistic version mismatch behavior
- unique constraint race normalization
- rollback behavior
- projection checkpoint monotonicity

Control-plane projection tests live in:
- `apps/control-plane/src/persistence/task-read-model.test.ts`
- `apps/control-plane/src/persistence/task-event-codec.test.ts`

ACP gateway projection tests live in:
- `apps/acp-gateway/src/persistence/run-read-model.test.ts`

## Control Plane Tests

Major control-plane coverage:
- governance policy in `apps/control-plane/src/governance/policy.test.ts`
- complexity scoring in `apps/control-plane/src/governance/complexity-scorer.test.ts`
- RBAC policy in `apps/control-plane/src/governance/rbac-policy.test.ts`
- operator policy in `apps/control-plane/src/operator-actions/policy.test.ts`
- orchestrator service in `apps/control-plane/src/services/orchestrator-service.test.ts`
- orchestration flow security scanning in `apps/control-plane/src/services/orchestrator-flows.test.ts`
- task run gateway fallback in `apps/control-plane/src/services/task-run-gateway.test.ts`
- metrics, analytics, and alert services in `apps/control-plane/src/services/*-service.test.ts`
- plugin store, discovery, extension catalog, and security policy in `apps/control-plane/src/services/plugin-*.test.ts`
- workflow template types, params, store, and engine in `apps/control-plane/src/services/workflow-template-*.test.ts`
- task, replay, operator, template, plugin, role, metrics, analytics, and alert routes under `apps/control-plane/src/routes/*.test.ts`
- security scanning in `apps/control-plane/src/security/*.test.ts`

Route tests usually instantiate Fastify apps directly and inject memory stores or services.

## ACP Gateway Tests

Major gateway coverage:
- run routes in `apps/acp-gateway/src/routes/runs.test.ts`
- run read model in `apps/acp-gateway/src/persistence/run-read-model.test.ts`
- worker runner in `apps/acp-gateway/src/workers/worker-runner.test.ts`
- Codex exec wrapper in `apps/acp-gateway/src/codex/exec.test.ts`
- registry and discovery in `apps/acp-gateway/src/agent-registry/*.test.ts`
- JSON-RPC and message routing in `apps/acp-gateway/src/agent-protocol/*.test.ts`
- health and failover in `apps/acp-gateway/src/agent-health/*.test.ts`
- scheduler and bottleneck analysis in `apps/acp-gateway/src/agent-scheduler/*.test.ts`
- scheduler route wiring in `apps/acp-gateway/src/routes/agent-scheduler.test.ts`
- plugin manifest adapter in `apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts`
- smoke coverage in `apps/acp-gateway/src/smoke.test.ts`

Gateway tests cover both pure logic and route-level behavior with injected stores/runners.

## Web Tests

`apps/web/vite.config.ts` configures Vitest with:
- `environment: "jsdom"`
- `setupFiles: "./src/test/setup.ts"`
- E2E and test-output exclusions

Primary web tests:
- `apps/web/src/app.test.tsx`
- `apps/web/src/lib/api.test.ts`
- `apps/web/src/hooks/use-analytics.test.ts`
- `apps/web/playwright.config.test.ts`

`apps/web/src/app.test.tsx` is the largest UI integration-style test and covers console-visible behavior across tasks, operator actions, analytics, alerts, plugins, and related panels.

## Playwright E2E

`apps/web/playwright.config.ts` runs tests from `apps/web/e2e`.

It starts:
- control plane from `apps/control-plane` with `FEUDAL_ACP_MODE=mock` and `PORT=4000`
- web preview from `apps/web` at `http://127.0.0.1:4173`

E2E files:
- `apps/web/e2e/task-flow.spec.ts`
- `apps/web/e2e/operator-console.spec.ts`

CI installs Playwright Chromium before `pnpm e2e`.

## High-Value Regression Commands

For shared contracts:

```bash
pnpm typecheck
pnpm --filter @feudal/contracts test
pnpm test
```

For control-plane changes:

```bash
pnpm typecheck
pnpm --filter @feudal/control-plane test
pnpm test
```

For ACP gateway changes:

```bash
pnpm typecheck
pnpm --filter @feudal/acp-gateway test
pnpm test
```

For web changes:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

For persistence changes:

```bash
pnpm typecheck
pnpm --filter @feudal/persistence test
pnpm test
```

## Testing Risks

- `apps/web/src/app.test.tsx` and `apps/control-plane/src/services/orchestrator-service.test.ts` are large integration-style files. They provide useful coverage but failures can be hard to localize.
- Token usage metrics remain placeholder zeros in `apps/control-plane/src/services/analytics-service.ts`; tests should not treat real token cost aggregation as implemented.
- There is still no root lint, formatting, or coverage command.
- E2E depends on local ports 4000 and 4173 being available unless Playwright reuses already running servers.

---

*Testing analysis: 2026-05-04*
