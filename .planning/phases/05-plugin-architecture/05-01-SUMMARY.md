---
phase: 05-plugin-architecture
plan: 01
subsystem: contracts-api
tags: [plugins, zod, lifecycle, discovery, vitest]
requires:
  - phase: 03-workflow-templates
    provides: Store and lifecycle event patterns for in-memory registries
  - phase: 02-multi-agent-foundation
    provides: ACP agent registry and manifest patterns
provides:
  - Shared plugin manifest, lifecycle, diagnostic, source, record, and enabled-extension contracts
  - Internal plugin helper functions for manifest definition and validation
  - Control-plane PluginStore and MemoryPluginStore lifecycle implementation
  - Local plugin.json discovery with fail-closed diagnostics
affects: [05-plugin-architecture, plugin-ecosystem, acp-gateway, workflow-templates]
tech-stack:
  added: []
  patterns: [Zod contract module, in-memory lifecycle store, local manifest discovery]
key-files:
  created:
    - packages/contracts/src/plugins/types.ts
    - packages/contracts/src/plugins/sdk.ts
    - packages/contracts/src/plugins/index.ts
    - packages/contracts/src/plugins/types.test.ts
    - apps/control-plane/src/services/plugin-store.ts
    - apps/control-plane/src/services/plugin-store.test.ts
    - apps/control-plane/src/services/plugin-discovery.ts
    - apps/control-plane/src/services/plugin-discovery.test.ts
  modified:
    - packages/contracts/src/index.ts
    - packages/contracts/src/index.test.ts
key-decisions:
  - "Plugin contracts live in @feudal/contracts and are re-exported from the root contract module."
  - "Plugin lifecycle state is constrained to discovered, registered, enabled, disabled, and failed."
  - "Local discovery rejects unsafe entry paths, duplicate ids, invalid JSON, invalid manifests, and missing entry files before registration."
patterns-established:
  - "Plugin manifests use strict Zod schemas with discriminated extension point unions."
  - "MemoryPluginStore mirrors the template store pattern while exposing plugin-specific enable, disable, reload, failure, and extension listing operations."
requirements-completed: [PLG-01, PLG-02]
duration: 15 min
completed: 2026-05-02
---

# Phase 05 Plan 01: Plugin Architecture Substrate Summary

**Local plugin contracts, lifecycle store, and manifest discovery with fail-closed validation**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-02T11:54:00Z
- **Completed:** 2026-05-02T12:09:12Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `packages/contracts/src/plugins` with manifest, lifecycle, diagnostic, source, record, enabled-extension, and helper exports.
- Implemented `MemoryPluginStore` with register, enable, disable, reload, failed diagnostics, lifecycle history, and enabled extension listing.
- Implemented `PluginDiscovery` for local `plugin.json` scanning with deterministic failure diagnostics and entry-path safety checks.

## Task Commits

1. **Task 1: Add shared plugin contracts and internal helper surface** - `656669b` (feat)
2. **Task 2: Implement PluginStore and MemoryPluginStore lifecycle** - `6034df6` (feat)
3. **Task 3: Implement local plugin manifest discovery** - `ba4a059` (feat)

**Plan metadata:** pending in this summary commit.

## Files Created/Modified

- `packages/contracts/src/plugins/types.ts` - Canonical plugin manifest, lifecycle, diagnostics, record, and enabled extension schemas.
- `packages/contracts/src/plugins/sdk.ts` - Internal `definePluginManifest` and `validatePluginManifest` helpers.
- `packages/contracts/src/plugins/index.ts` - Plugin contract barrel exports.
- `packages/contracts/src/plugins/types.test.ts` - Contract tests for valid manifests, unknown extension points, duplicate extension ids, lifecycle states, and SDK helpers.
- `packages/contracts/src/index.ts` - Root export for plugin contracts.
- `packages/contracts/src/index.test.ts` - Root export parse coverage for `PluginManifestSchema`.
- `apps/control-plane/src/services/plugin-store.ts` - Plugin lifecycle store interface and in-memory implementation.
- `apps/control-plane/src/services/plugin-store.test.ts` - Lifecycle, duplicate id, failure, reload, filtering, and enabled-extension tests.
- `apps/control-plane/src/services/plugin-discovery.ts` - Local manifest discovery service.
- `apps/control-plane/src/services/plugin-discovery.test.ts` - Local discovery happy-path and fail-closed diagnostic tests.

## Decisions Made

- Kept Phase 5 local-first and manifest-driven; no marketplace, remote install, or filesystem watcher behavior was introduced.
- Used strict Zod schemas and explicit lifecycle states so invalid plugin declarations cannot silently affect execution.
- Treated discovery failures as structured diagnostics instead of thrown process-level errors, allowing manual reload APIs to report partial success later.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** No scope change.

## Issues Encountered

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts --pool=forks`
  - Result: 2 files, 27 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-store.test.ts --pool=forks`
  - Result: 1 file, 10 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-discovery.test.ts --pool=forks`
  - Result: 1 file, 9 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/plugin-store.test.ts apps/control-plane/src/services/plugin-discovery.test.ts --pool=forks`
  - Result: 4 files, 46 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `05-02`: lifecycle API routes, default wiring, enabled extension catalog, and ACP gateway adapter can now consume the plugin contracts, store, and discovery service.

---
*Phase: 05-plugin-architecture*
*Completed: 2026-05-02*

