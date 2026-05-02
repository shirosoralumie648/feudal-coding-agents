# Codebase Stack

**Generated:** 2026-05-02  
**Scope:** full repository  
**Source priority:** code, package manifests, config files, tests, then docs

## Summary

This repository is a TypeScript pnpm workspace for a single-machine, single-user governance system around AI coding agents. The runtime is split into a Fastify control plane, a Fastify ACP gateway, a Vite/React web console, and shared workspace packages.

The current system is not a large distributed agent cluster. The implemented runtime is the code in `apps/*` and `packages/*`, with historical design language kept in docs as context.

## Runtime Platform

- Node.js 20 is the CI baseline in `.github/workflows/ci.yml`.
- pnpm 10 is the package manager, declared in `package.json`.
- TypeScript is the primary language across all apps and packages.
- ESM is used in app/package manifests via `"type": "module"`.
- Shared compiler settings live in `tsconfig.base.json`.
- Workspace membership is defined by `pnpm-workspace.yaml` with `apps/*` and `packages/*`.

## Root Scripts

Root scripts in `package.json`:

- `pnpm dev`: runs `@feudal/acp-gateway`, `@feudal/control-plane`, and `@feudal/web` together.
- `pnpm test`: runs the Vitest workspace through `vitest.config.ts`.
- `pnpm build`: builds `@feudal/web`.
- `pnpm e2e`: runs Playwright tests in `apps/web`.
- `pnpm db:migrate`: runs the persistence package migrations.

There is no root lint, format, or typecheck script in `package.json`; quality gates are currently test/build centered.

## Shared TypeScript Configuration

`tsconfig.base.json` sets:

- `target`: `ES2022`
- `module`: `ESNext`
- `moduleResolution`: `Bundler`
- `strict`: `true`
- `baseUrl`: repository root
- path aliases for `@feudal/contracts`, `@feudal/orchestrator`, and `@feudal/acp`

The path aliases point directly to source files such as `packages/contracts/src/index.ts`, so local package consumers run against source rather than built artifacts during development.

## Applications

### `apps/control-plane`

`apps/control-plane/package.json` defines the task/governance API app.

Key dependencies:

- `fastify` for HTTP routing.
- `zod` for request and domain validation.
- `@feudal/contracts` for task, run, governance, recovery, RBAC, and metrics schemas.
- `@feudal/orchestrator` for deterministic task transitions.
- `@feudal/acp` for mock and HTTP ACP clients.
- `@feudal/persistence` for optional Postgres event persistence.
- `tsx` for development execution.
- `pg-mem` for database-like tests.

Important entry points:

- `apps/control-plane/src/server.ts`
- `apps/control-plane/src/config.ts`
- `apps/control-plane/src/services/orchestrator-service.ts`

### `apps/acp-gateway`

`apps/acp-gateway/package.json` defines the ACP run service and worker execution bridge.

Key dependencies:

- `fastify` for run, agent registry, messaging, and health routes.
- `zod` for route payloads and protocol schemas.
- `@feudal/acp` for ACP contracts and clients.
- `@feudal/persistence` for optional run event persistence.
- `tsx` for development execution.
- `pg-mem` for persistence tests.

Important entry points:

- `apps/acp-gateway/src/server.ts`
- `apps/acp-gateway/src/routes/runs.ts`
- `apps/acp-gateway/src/workers/worker-runner.ts`
- `apps/acp-gateway/src/codex/exec.ts`

### `apps/web`

`apps/web/package.json` defines the React console.

Key dependencies:

- React 19 and React DOM 19.
- Vite 7 with `@vitejs/plugin-react`.
- `@testing-library/react` and `@testing-library/jest-dom` for component tests.
- Playwright for browser E2E.
- `jsdom` for Vitest browser-like tests.
- `@feudal/contracts` for typed task/projection data.

Important entry points:

- `apps/web/src/main.tsx`
- `apps/web/src/app.tsx`
- `apps/web/src/hooks/use-task-console.ts`
- `apps/web/src/lib/api.ts`

## Packages

### `packages/contracts`

`packages/contracts/src/index.ts` exports the shared Zod schemas and inferred TypeScript types for:

- task status and workflow phase vocabulary
- governance actions and operator actions
- task records and task projections
- run summaries and run projections
- recovery summary contracts
- token usage metrics contracts

Additional governance contracts live under `packages/contracts/src/governance/`, including RBAC, rule engine, and auto-approval schemas.

### `packages/orchestrator`

`packages/orchestrator/src/task-machine.ts` is the deterministic task state machine. It defines task events and valid transitions between states such as `draft`, `intake`, `planning`, `review`, `awaiting_approval`, `dispatching`, `executing`, `verifying`, and terminal states.

### `packages/acp`

`packages/acp/src/index.ts` defines ACP messages, artifacts, manifests, runs, and the `ACPClient` interface.

Client implementations:

- `packages/acp/src/mock-client.ts`
- `packages/acp/src/http-client.ts`

### `packages/persistence`

`packages/persistence/src/event-store.ts` implements the Postgres-backed append-only event store.

`packages/persistence/src/migrations.ts` creates:

- `event_log`
- `projection_checkpoint`
- `tasks_current`
- `task_history_entries`
- `runs_current`
- `artifacts_current`
- `operator_actions`

`packages/persistence/src/postgres.ts` configures `pg` and validates `DATABASE_URL`.

## Testing Stack

- Vitest 3 is the unit and integration runner.
- The root `vitest.config.ts` enumerates all app/package projects.
- `pg-mem` is used for Postgres-like tests in persistence-facing code.
- Playwright 1.55 runs web E2E tests from `apps/web/e2e`.
- `apps/web/vite.config.ts` configures `jsdom` and excludes E2E folders from unit tests.

## Build and Dev Server Stack

- `apps/control-plane` runs via `tsx watch src/server.ts` and defaults to port `4000`.
- `apps/acp-gateway` runs via `tsx watch src/server.ts` and defaults to port `4100`.
- `apps/web` runs via Vite and proxies `/api` to `http://127.0.0.1:4000`.
- `apps/web/playwright.config.ts` starts the control plane with `FEUDAL_ACP_MODE=mock` for E2E.

## Configuration and Environment

Environment variables currently used by code:

- `DATABASE_URL`: enables Postgres-backed task/run stores. Without it, memory stores are used.
- `PORT`: controls Fastify listen ports for both apps.
- `ACP_BASE_URL`: control-plane HTTP ACP target; defaults to `http://127.0.0.1:4100`.
- `FEUDAL_ACP_MODE`: `mock` switches control-plane execution to mock ACP behavior.
- `npm_package_version`: exposed by `/metrics/health` when available.

## Current Build Artifacts and Generated Output

Generated or local-only directories exist in the working tree, including:

- `apps/web/dist`
- `apps/web/playwright-report`
- `apps/web/test-results`
- app/package `node_modules`

These are not source-of-truth for mapping. Source and config files under `apps/*/src`, `packages/*/src`, root config, and CI are authoritative.

