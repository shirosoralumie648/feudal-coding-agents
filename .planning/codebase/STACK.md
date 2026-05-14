# Technology Stack

**Analysis Date:** 2026-05-04

## Languages

**Primary:**
- TypeScript - all application and package source under `apps/**/*.ts`, `apps/**/*.tsx`, and `packages/**/*.ts`.
- TSX / React JSX - web console UI in `apps/web/src/app.tsx`, `apps/web/src/main.tsx`, and `apps/web/src/components/*.tsx`.

**Secondary:**
- CSS - web console styling in `apps/web/src/styles.css`.
- JSON - package manifests, plugin manifests, alert rules, and TypeScript config in `package.json`, `plugins/examples/code-review-bot/plugin.json`, `apps/control-plane/config/alert-rules.json`, and `tsconfig.base.json`.
- Markdown - project and planning docs in `README.md`, `docs/ARCHITECTURE.md`, `docs/plugins/sdk.md`, and `.planning/**`.

## Runtime

**Environment:**
- Node.js 20+ is the documented runtime in `README.md`; CI uses Node 20 in `.github/workflows/ci.yml`.
- pnpm 10 is the package manager declared by `"packageManager": "pnpm@10.0.0"` in `package.json`.
- All runtime packages use ESM via `"type": "module"` in `apps/*/package.json` and `packages/*/package.json`.
- TypeScript targets ES2022 with `moduleResolution: "Bundler"` in `tsconfig.base.json`.

**Workspace:**
- `pnpm-workspace.yaml` declares `apps/*` and `packages/*`.
- Root scripts in `package.json` are the authoritative command surface:
  - `pnpm dev`
  - `pnpm test`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm db:migrate`
  - `pnpm e2e`

## Frameworks and Libraries

**Backend:**
- Fastify - HTTP APIs in `apps/control-plane/src/server.ts` and `apps/acp-gateway/src/server.ts`.
- Zod - schemas and runtime validation in `packages/contracts/src/index.ts`, `packages/contracts/src/plugins/types.ts`, `packages/contracts/src/analytics/types.ts`, and route modules under `apps/*/src/routes`.
- `pg` - optional PostgreSQL connectivity in `packages/persistence/src/postgres.ts` and event-store operations in `packages/persistence/src/event-store.ts`.

**Frontend:**
- React 19 - operator console UI in `apps/web/src/app.tsx`.
- React DOM - browser mount in `apps/web/src/main.tsx`.
- Vite - dev server, preview, build, and Vitest integration in `apps/web/vite.config.ts`.
- Recharts - analytics visualization dependency used by `apps/web/src/components/analytics-dashboard.tsx`.

**Testing:**
- Vitest - root workspace runner in `vitest.config.ts` and app/package `test` scripts.
- jsdom and Testing Library - web tests configured by `apps/web/vite.config.ts` and `apps/web/src/test/setup.ts`.
- Playwright - browser E2E in `apps/web/e2e/*.spec.ts` with config in `apps/web/playwright.config.ts`.
- pg-mem - Postgres-like tests in `packages/persistence/src/event-store.test.ts`, `apps/control-plane/src/persistence/task-read-model.test.ts`, and `apps/acp-gateway/src/persistence/run-read-model.test.ts`.

**Development tooling:**
- `tsx` - dev server and migration runtime in `apps/control-plane/package.json`, `apps/acp-gateway/package.json`, and `packages/persistence/package.json`.
- TypeScript compiler - explicit root gate through `tsconfig.typecheck.json`.
- GitHub Actions - install, Playwright Chromium install, tests, build, and E2E in `.github/workflows/ci.yml`.

## Workspace Packages

**Applications:**
- `@feudal/control-plane` in `apps/control-plane`: Fastify task, governance, replay, analytics, alert, plugin, template, RBAC, and orchestration API.
- `@feudal/acp-gateway` in `apps/acp-gateway`: Fastify ACP run service, Codex worker execution bridge, agent registry, messaging, health, failover, scheduler, and plugin adapter boundary.
- `@feudal/web` in `apps/web`: Vite + React console for overview, task detail, approvals, operator actions, replay, analytics, alerts, agent registry, and plugin ecosystem.

**Shared packages:**
- `@feudal/contracts` in `packages/contracts`: shared Zod schemas and TypeScript types for tasks, runs, governance, analytics, RBAC, plugins, and token usage.
- `@feudal/orchestrator` in `packages/orchestrator`: deterministic task state machine in `packages/orchestrator/src/task-machine.ts`.
- `@feudal/acp` in `packages/acp`: ACP protocol types plus mock and HTTP clients in `packages/acp/src/mock-client.ts` and `packages/acp/src/http-client.ts`.
- `@feudal/persistence` in `packages/persistence`: Postgres pool, migrations, event store, and exports.

## Configuration

**Environment variables:**
- `DATABASE_URL` enables PostgreSQL-backed task and run projections; absence selects in-memory stores.
- `ACP_BASE_URL` points the control plane to the ACP gateway; default is `http://127.0.0.1:4100`.
- `FEUDAL_ACP_MODE=mock` selects the mock ACP client; default is HTTP ACP.
- `PORT` selects backend listen ports: control plane defaults to 4000 and ACP gateway defaults to 4100.
- `ALERT_WEBHOOK_URL` enables webhook alert delivery in `apps/control-plane/src/services/alert-service.ts`.
- `FEUDAL_PLUGIN_DIRS` configures local plugin roots; default roots are `plugins` and `plugins/examples`.
- `npm_package_version` is read by metrics routes for version metadata.

**Build and checks:**
- `tsconfig.base.json` defines strict shared compiler settings and workspace aliases.
- `tsconfig.typecheck.json` typechecks app and package implementation files while excluding tests, E2E, and generated outputs.
- `vitest.config.ts` declares projects for all apps and packages.
- `apps/web/vite.config.ts` proxies `/api` to the control plane and configures jsdom tests.
- `apps/web/playwright.config.ts` starts the control plane in mock ACP mode and a web preview server.

## Platform Requirements

**Development:**
- Use Node.js 20+ and pnpm 10.
- Run commands from the repository root.
- Install dependencies with `pnpm install`.
- Start all apps with `pnpm dev`.
- Start individual services with `pnpm --filter @feudal/control-plane dev`, `pnpm --filter @feudal/acp-gateway dev`, or `pnpm --filter @feudal/web dev`.
- Apply database migrations with `pnpm db:migrate` when `DATABASE_URL` is configured.

**Production shape:**
- The current checkout has no Dockerfile, compose file, deployment manifest, or hosting adapter.
- Backend production runtime is Node/Fastify.
- Durable production state requires PostgreSQL via `DATABASE_URL`; otherwise task, run, registry, scheduler, and plugin state are process-local or memory-backed depending on subsystem.

## Tooling Gaps

- No ESLint, Prettier, Biome, `.nvmrc`, `.node-version`, Dockerfile, or compose file is detected.
- A `package-lock.json` exists in the working tree even though pnpm is the authoritative package manager.

---

*Stack analysis: 2026-05-04*
