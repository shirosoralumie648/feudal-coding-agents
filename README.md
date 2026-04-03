# feudal-coding-agents

Feudal-style Codex cluster prototype with a Fastify control plane, an ACP gateway, a React web console, and event-sourced replay/recovery for task execution.

## Workspace

- `apps/control-plane`: task intake, approvals, replay APIs, and orchestration.
- `apps/acp-gateway`: ACP-facing run service and Codex worker execution bridge.
- `apps/web`: Vite + React console for overview, approvals, replay timeline, and diffs.
- `packages/contracts`: shared Zod schemas and TypeScript domain types.
- `packages/orchestrator`: deterministic task state machine.
- `packages/acp`: ACP client/runtime abstractions.
- `packages/persistence`: Postgres event store and migrations.

## Prerequisites

- Node.js 20+
- `pnpm` 10
- Optional Postgres for persisted recovery flows via `DATABASE_URL`

Without `DATABASE_URL`, the apps run with in-memory stores. With `DATABASE_URL`, startup rebuilds read models from persisted events.

## Quick Start

```bash
pnpm install
pnpm dev
```

Default local endpoints:

- Web console: `http://localhost:5173`
- Control plane: `http://localhost:4000`
- ACP gateway: `http://localhost:4100`

## Common Commands

```bash
pnpm test
pnpm build
pnpm e2e
pnpm db:migrate
```

- `pnpm test`: run the full Vitest workspace suite.
- `pnpm build`: build the web console.
- `pnpm e2e`: run the Playwright browser flow for the web app.
- `pnpm db:migrate`: apply Postgres migrations for the persistence package.

## Current Scope

The repository currently supports task creation, approval-gated execution, ACP run tracking, replay APIs, recovery summaries, and restart recovery verification. Operator auth, RBAC, and multi-user governance are still out of scope.
