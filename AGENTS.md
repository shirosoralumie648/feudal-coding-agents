# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace for a feudal-style Codex cluster MVP.

- `apps/control-plane`: Fastify API for task creation, approval, orchestration, and agent registry.
- `apps/web`: Vite + React web console for overview, task detail, approval inbox, new task intake, and agent registry.
- `packages/contracts`: Shared Zod schemas and TypeScript types.
- `packages/orchestrator`: Deterministic task state machine.
- `packages/acp`: ACP abstractions plus the mock ACP runtime used in Phase 1.
- `docs/superpowers/specs`: Architecture and product design notes.

Tests are colocated with source files using `*.test.ts` or `*.test.tsx`.

## Build, Test, and Development Commands
- `pnpm install`: install all workspace dependencies.
- `pnpm dev`: run the control-plane API and web console together.
- `pnpm --filter @feudal/control-plane dev`: run only the API on port `4000`.
- `pnpm --filter @feudal/web dev`: run only the web console.
- `pnpm test`: run the full Vitest workspace suite.
- `pnpm build`: build the web app for production.

Run commands from the repository root unless you are debugging a single package.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and ESM modules. Match the existing style:

- 2-space indentation
- double quotes
- `PascalCase` for React components and classes
- `camelCase` for functions and variables
- `kebab-case` filenames such as `task-machine.ts` and `mock-client.ts`

Keep contracts explicit. Prefer shared types from `packages/contracts` over duplicating shapes in apps.

## Testing Guidelines
Vitest is the primary test runner. Add tests before changing behavior for routes, state transitions, or UI flows. Keep UI tests focused on visible outcomes and API-driven state changes. When touching the web console, verify both `pnpm test` and `pnpm build`.

## Commit & Pull Request Guidelines
Recent history uses short imperative commits like `Add control-plane API and workflow service`. Keep commits single-purpose and easy to review.

PRs should include:

- a short description of the user-visible change
- linked issue or phase reference when available
- verification commands run, for example `pnpm test` and `pnpm build`
- screenshots or short recordings for `apps/web` changes

## Configuration Notes
Local-only overrides belong outside versioned files. Do not commit `node_modules`, `dist`, or machine-specific settings.
