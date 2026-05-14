# Phase 8: Plugin Ecosystem - Research

**Researched:** 2026-05-04
**Phase:** 08-plugin-ecosystem
**Goal:** Plan local plugin SDK, catalog, examples, and security controls on the existing Phase 5 plugin architecture.

## Research Complete

Source priority was current contracts/routes/services/tests, then Phase 5 and Phase 6 context.

## Phase Requirements

- `PLG-03`: Plugin API and SDK.
- `PSC-02`: Enhanced security controls and access management.

## Current Architecture Findings

- Shared plugin contracts already support strict manifests, ACP worker extensions, workflow step provider extensions, lifecycle records, diagnostics, and enabled extension snapshots.
- `MemoryPluginStore` owns lifecycle state and enabled extension listing.
- `PluginDiscovery` reads local `plugin.json` files, rejects invalid JSON, unsafe entry paths, duplicate ids, and missing entry modules.
- `/api/plugins/*` exposes list, status, history, discover, register, reload, enable, disable, and enabled extension routes.
- Web has no plugin panel and `apps/web/src/lib/api.ts` has no plugin ecosystem helpers.
- Security scanning exists for execution artifacts, but plugin enablement does not yet evaluate plugin permissions or require explicit approval for high-risk plugin access.

## Gaps for Phase 8

- No structured plugin permission declaration in manifests.
- No compatibility/risk review object for operators.
- No local marketplace/catalog endpoint that combines lifecycle, discovery, extension summary, compatibility, and security status.
- SDK helpers are minimal and do not help authors create extensions, permissions, or compatibility checks.
- No example plugin directory for local discovery.
- No operator console visibility for plugin ecosystem state.

## Recommended Plan Shape

1. Extend shared plugin contracts and SDK helpers for permissions, compatibility, security reviews, and marketplace entries.
2. Add control-plane plugin security policy plus local marketplace/catalog service and routes.
3. Add example plugin docs/files and a compact web plugin ecosystem panel.

## Constraints for Executors

- Keep all behavior local and deterministic.
- Keep old Phase 5 manifests valid by defaulting new security fields.
- Do not add dependencies or remote network calls.
- Use TDD for contract, route/service, and UI behavior.
- Run focused slices, then root typecheck, full Vitest, and build.
