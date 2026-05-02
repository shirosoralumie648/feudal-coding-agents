# Testing

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## Test Stack

The repository uses Vitest for unit/integration tests and Playwright for browser E2E.

Root test command:

```bash
pnpm test
```

Root build command:

```bash
pnpm build
```

Browser E2E command:

```bash
pnpm e2e
```

## Vitest Workspace

`vitest.config.ts` defines project-based test execution for:

- `packages/contracts`
- `packages/orchestrator`
- `packages/acp`
- `packages/persistence`
- `apps/acp-gateway`
- `apps/control-plane`
- `apps/web`

Each workspace package/app also has a local `test` script in its own `package.json`.

## Test File Count and Placement

Current checkout contains 42 TypeScript/TSX test and E2E files under `apps` and `packages`.

Test placement follows a colocated pattern:

- source: `packages/orchestrator/src/task-machine.ts`
- test: `packages/orchestrator/src/task-machine.test.ts`

Examples:

- `packages/contracts/src/index.test.ts`
- `packages/acp/src/mock-client.test.ts`
- `packages/acp/src/http-client.test.ts`
- `packages/persistence/src/event-store.test.ts`
- `apps/control-plane/src/services/orchestrator-service.test.ts`
- `apps/control-plane/src/routes/tasks.test.ts`
- `apps/acp-gateway/src/routes/runs.test.ts`
- `apps/web/src/app.test.tsx`

## Contracts Tests

`packages/contracts/src/index.test.ts` verifies:

- task specs
- task statuses
- workflow phase derivation
- ACP run summaries
- governance metadata
- operator actions and summaries
- recovery state metadata
- task/run projections
- token usage contracts

Governance contract subpackages are covered through files under `packages/contracts/src/governance/` and consumers in `apps/control-plane/src/governance/*.test.ts`.

## State Machine Tests

`packages/orchestrator/src/task-machine.test.ts` covers legal transitions and illegal transition rejection for:

- happy path intake/planning flow
- review outcomes
- approval gates
- operator recovery
- takeover
- abandon

This package is small but important because application services depend on `transitionTask()` for lifecycle legality.

## ACP Client Tests

`packages/acp/src/mock-client.test.ts` covers the mock runtime for:

- manifest listing
- approval await/resume
- prompt-marker driven review behavior
- execution and verification mock outputs
- unknown agent errors

`packages/acp/src/http-client.test.ts` stubs global `fetch` and checks request paths and error behavior for the HTTP ACP client.

## Persistence Tests

`packages/persistence/src/event-store.test.ts` uses `pg-mem` to verify:

- migration table creation
- event append ordering
- safe int8 parsing
- optimistic version mismatch behavior
- unique constraint race normalization
- transaction rollback behavior
- checkpoint monotonicity

Control-plane projection tests live in `apps/control-plane/src/persistence/task-read-model.test.ts`.

ACP gateway projection tests live in `apps/acp-gateway/src/persistence/run-read-model.test.ts`.

## Control Plane Tests

Major control-plane coverage areas:

- governance policy in `apps/control-plane/src/governance/policy.test.ts`
- complexity scoring in `apps/control-plane/src/governance/complexity-scorer.test.ts`
- operator policy in `apps/control-plane/src/operator-actions/policy.test.ts`
- task event codec in `apps/control-plane/src/persistence/task-event-codec.test.ts`
- orchestrator service flow in `apps/control-plane/src/services/orchestrator-service.test.ts`
- run gateway fallback behavior in `apps/control-plane/src/services/task-run-gateway.test.ts`
- workflow templates in `apps/control-plane/src/services/workflow-template-*.test.ts`
- task routes in `apps/control-plane/src/routes/tasks.test.ts`
- replay routes in `apps/control-plane/src/routes/replay.test.ts`
- operator routes in `apps/control-plane/src/routes/operator-actions.test.ts`
- template routes in `apps/control-plane/src/routes/templates.test.ts`
- security scanning in `apps/control-plane/src/security/*.test.ts`

`apps/control-plane/src/services/orchestrator-service.test.ts` is a large integration-style test file and exercises the most critical cross-service behavior.

## ACP Gateway Tests

Major gateway coverage areas:

- run routes in `apps/acp-gateway/src/routes/runs.test.ts`
- run read model in `apps/acp-gateway/src/persistence/run-read-model.test.ts`
- worker runner in `apps/acp-gateway/src/workers/worker-runner.test.ts`
- Codex exec wrapper in `apps/acp-gateway/src/codex/exec.test.ts`
- registry and discovery in `apps/acp-gateway/src/agent-registry/*.test.ts`
- JSON-RPC and routing in `apps/acp-gateway/src/agent-protocol/*.test.ts`
- health and failover in `apps/acp-gateway/src/agent-health/*.test.ts`
- smoke coverage in `apps/acp-gateway/src/smoke.test.ts`

Tests cover both pure logic and route-level behavior with injected stores/runners.

## Web Tests

`apps/web/vite.config.ts` configures Vitest with:

- `environment: "jsdom"`
- `setupFiles: "./src/test/setup.ts"`
- E2E/test result folders excluded from unit tests

`apps/web/src/app.test.tsx` is the main integration-style React test file and uses mocked HTTP responses.

`apps/web/src/lib/api.test.ts` checks API client behavior and response normalization.

## Playwright E2E

`apps/web/playwright.config.ts` runs tests from `apps/web/e2e`.

The config starts:

- control-plane from `apps/control-plane` with `FEUDAL_ACP_MODE=mock` and `PORT=4000`
- web preview from `apps/web` at `http://127.0.0.1:4173`

E2E files:

- `apps/web/e2e/task-flow.spec.ts`: drives a governance revision loop through approval and completion.
- `apps/web/e2e/operator-console.spec.ts`: covers operator takeover from the console.

CI installs Playwright Chromium before running `pnpm e2e`.

## Manual and Missing Test Gates

There is no root command for:

- linting
- formatting check
- explicit TypeScript-only typecheck
- coverage enforcement

Coverage can be requested manually in plans, but root `package.json` does not define a coverage script.

## High-Value Regression Commands

For backend-only changes:

```bash
pnpm test
```

For web changes:

```bash
pnpm test
pnpm build
pnpm e2e
```

For persistence changes:

```bash
pnpm --filter @feudal/persistence test
pnpm test
```

For ACP gateway run/worker changes:

```bash
pnpm --filter @feudal/acp-gateway test
pnpm test
```

## Testing Risks

- Large integration test files such as `apps/control-plane/src/services/orchestrator-service.test.ts` and `apps/web/src/app.test.tsx` are useful but can become hard to localize when failures occur.
- Route coverage is strong for registered routes, but `apps/control-plane/src/routes/roles.ts` is not registered in `server.ts`, so role route tests would not prove default app exposure unless the route is explicitly wired in test setup.
- Metrics token usage is placeholder behavior in `apps/control-plane/src/routes/metrics.ts`; tests should avoid treating token aggregation as implemented until real data is wired.

