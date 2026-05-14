---
phase: 05-plugin-architecture
status: complete
researched: 2026-05-02
requirements: [PLG-01, PLG-02]
---

# Phase 05 Research: Plugin Architecture

## Research Question

What needs to be known to plan a local-first plugin architecture that fits the existing Feudal Coding Agents codebase?

## Key Findings

### Current Extension Model

- `apps/acp-gateway/src/manifests.ts` is the current runtime agent manifest source of truth. It already models optional agents through `required` and `enabledByDefault`.
- `apps/acp-gateway/src/agent-registry/registry.ts` has the right lifecycle primitives for dynamic registration: validation, duplicate-id rejection, persistent/temporary registration, event replay, status changes, and change callbacks.
- `apps/acp-gateway/src/agent-registry/seed.ts` converts static `ACPAgentManifest` records into registry inputs. Plugin worker/agent extension points should reuse this adapter shape instead of creating a second registry model.
- `apps/acp-gateway/src/workers/registry.ts` is currently a static `Record<GatewayWorkerName, WorkerDefinition>`. Phase 5 should not promise arbitrary runtime worker code execution unless the plan explicitly constrains it to trusted local modules.

### Control-Plane Patterns

- `apps/control-plane/src/routes/templates.ts` is the strongest API pattern for this phase: route dependency injection, `safeParse` request validation, consistent error mapping, and testable Fastify route modules.
- `apps/control-plane/src/services/workflow-template-store.ts` is the right model for `PluginStore`: an interface plus in-memory implementation, event history, version-like lifecycle events, and optimistic state transitions without Postgres.
- `apps/control-plane/src/config.ts` is the right place for default plugin singletons. Keep the same lazy/injectable style so tests can pass stores and discovery roots explicitly.
- `apps/control-plane/src/server.ts` should only register plugin routes and lifecycle hooks. It should not embed filesystem traversal logic directly.

### Shared Contract Boundary

- `packages/contracts/src/index.ts` is already the common Zod/type boundary used by control-plane, web, and analytics.
- Plugin manifest schemas should live under `packages/contracts/src/plugins/` and be re-exported from `packages/contracts/src/index.ts`.
- Contract tests should verify strict extension-point validation, lifecycle state values, semver compatibility metadata, duplicate/invalid capability rejection, and root export availability.

### Recommended Scope Split

Plan 05-01 should build the architecture substrate:

- shared plugin manifest and lifecycle schemas
- internal plugin SDK/type surface
- `PluginStore` and `MemoryPluginStore`
- local plugin manifest discovery that validates `plugin.json` and fail-closes on invalid manifests

Plan 05-02 should expose and integrate the substrate:

- `/api/plugins/*` lifecycle routes
- config/server wiring and manual reload
- enabled extension listing for downstream consumers
- ACP gateway adapter that converts enabled ACP worker/agent plugin extension points into registry registrations
- workflow-template extension catalog surface for plugin-provided step/provider declarations

## Technical Constraints

- No filesystem watchers. Manual reload is required because this repo has already hit watcher limits with `ENOSPC`.
- No remote plugin installation. Discovery reads local directories only.
- No sandbox claims. Loaded modules are trusted local execution and must be clearly labeled that way.
- Invalid manifests, duplicate plugin ids, incompatible app/version metadata, missing entry paths, and import failures must leave plugins `failed` or disabled.
- Plugin entry paths should be relative to the plugin directory. Reject absolute paths and `..` traversal.
- Route tests should use injected stores/discovery roots and `Fastify().inject()`.

## Validation Architecture

| Area | Verification |
|------|--------------|
| Contracts | `packages/contracts/src/plugins/types.test.ts`, `packages/contracts/src/index.test.ts` |
| Store and discovery | `apps/control-plane/src/services/plugin-store.test.ts`, `apps/control-plane/src/services/plugin-discovery.test.ts` |
| API lifecycle | `apps/control-plane/src/routes/plugins.test.ts` |
| Server wiring | `apps/control-plane/src/server.ts` registration covered by route/app tests |
| Gateway adapter | `apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts` |

Primary command:

`COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/plugin-store.test.ts apps/control-plane/src/services/plugin-discovery.test.ts apps/control-plane/src/routes/plugins.test.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks`

Use `--pool=forks` and `CHOKIDAR_USEPOLLING=true` to avoid local watcher failures.

## Risks

- Over-scoping into a marketplace would collide with Phase 8. Keep public publishing, remote discovery, and external SDK docs out of Phase 5.
- Arbitrary module loading can become a security claim. The first implementation should prefer manifest-only lifecycle plus optional trusted local module validation.
- Gateway/control-plane source-of-truth drift is possible. Control-plane owns lifecycle truth; gateway should consume enabled declarations through an adapter, not maintain its own plugin lifecycle state.

## RESEARCH COMPLETE

