---
phase: 05-plugin-architecture
plan: 02
subsystem: api-integration
tags: [plugins, fastify, lifecycle, extension-catalog, acp-gateway]
requires:
  - phase: 05-plugin-architecture
    provides: plugin contracts, lifecycle store, and local discovery from 05-01
provides:
  - Control-plane plugin lifecycle API routes under /api/plugins
  - Default plugin store, discovery, and enabled extension catalog wiring
  - ACP gateway adapter from enabled plugin worker declarations to agent registrations
  - Package lock synchronization for the new gateway contract dependency
affects: [control-plane, acp-gateway, plugin-ecosystem, workflow-templates]
tech-stack:
  added: []
  patterns: [operator-plugin-lifecycle-routes, manual-plugin-reload, enabled-extension-catalog, gateway-plugin-adapter]
key-files:
  created:
    - apps/control-plane/src/routes/plugins.ts
    - apps/control-plane/src/routes/plugins.test.ts
    - apps/control-plane/src/services/plugin-extension-catalog.ts
    - apps/control-plane/src/services/plugin-extension-catalog.test.ts
    - apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts
    - apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts
    - apps/acp-gateway/src/plugins/index.ts
  modified:
    - apps/control-plane/src/config.ts
    - apps/control-plane/src/server.ts
    - apps/acp-gateway/package.json
    - pnpm-lock.yaml
key-decisions:
  - "Control-plane exposes plugin lifecycle truth through explicit /api/plugins routes and does not start filesystem watchers."
  - "Manual discovery and reload stay operator-triggered so failed local plugin manifests report diagnostics without enabling unsafe records."
  - "ACP gateway consumes enabled plugin worker declarations through an adapter and does not own plugin lifecycle state."
patterns-established:
  - "Plugin APIs use Fastify injection-testable route registration with MemoryPluginStore and fake discovery."
  - "PluginExtensionCatalog is the internal enabled-extension query surface for ACP workers and workflow step providers."
  - "ACP gateway plugin adapters convert acp-worker extension points into AgentRegistrationInput records with plugin metadata."
requirements-completed: [PLG-01, PLG-02]
duration: 25 min
completed: 2026-05-02
---

# Phase 05 Plan 02: Plugin API Integration Summary

**Operator-controlled plugin lifecycle APIs, enabled extension catalog, and ACP gateway worker adapter**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-02T12:10:00Z
- **Completed:** 2026-05-02T12:35:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `/api/plugins/*` lifecycle routes for list, status, history, manual discovery, inline registration, manual reload, enable, disable, and enabled extension listing.
- Wired default plugin store, local discovery roots from `FEUDAL_PLUGIN_DIRS`, and `PluginExtensionCatalog` into `createControlPlaneApp`.
- Added `PluginExtensionCatalog` helpers for enabled extension snapshots, ACP worker lookup, workflow provider lookup, and step type listing.
- Added ACP gateway plugin adapter functions that convert enabled plugin `acp-worker` declarations into `AgentRegistrationInput` records without giving the gateway lifecycle ownership.
- Synchronized `pnpm-lock.yaml` for the new `@feudal/contracts` workspace dependency in `apps/acp-gateway`.

## Task Commits

1. **Task 1: Add /api/plugins lifecycle routes** - `4d7a685` (feat)
2. **Task 2: Wire default plugin services and extension catalog** - `4104755` (feat)
3. **Task 3: Add ACP gateway plugin manifest adapter** - `c306123` (feat)
4. **Packaging sync: Add gateway contract lockfile entry** - `5d7811e` (chore)
5. **Helper hardening: Expand catalog and adapter helper surface** - `28930e5` (feat)

**Plan metadata:** pending in this summary commit.

## Files Created/Modified

- `apps/control-plane/src/routes/plugins.ts` - Fastify plugin lifecycle API under `/api/plugins/*`.
- `apps/control-plane/src/routes/plugins.test.ts` - Injection tests for lifecycle routes, reload behavior, validation, and fail-closed enablement.
- `apps/control-plane/src/services/plugin-extension-catalog.ts` - Enabled ACP worker and workflow step provider catalog.
- `apps/control-plane/src/services/plugin-extension-catalog.test.ts` - Catalog filtering and lookup tests.
- `apps/control-plane/src/config.ts` - Default plugin store, discovery, catalog, and `FEUDAL_PLUGIN_DIRS` parsing.
- `apps/control-plane/src/server.ts` - Plugin route registration and test injection options.
- `apps/acp-gateway/package.json` - Added `@feudal/contracts` workspace dependency.
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts` - Plugin manifest and record adapters for ACP agent registration.
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts` - Adapter tests for worker conversion and enabled-record filtering.
- `apps/acp-gateway/src/plugins/index.ts` - Plugin adapter barrel export.
- `pnpm-lock.yaml` - Workspace lock entry for the new gateway contract dependency.

## Decisions Made

- Kept reload manual and API-triggered, matching the Phase 5 local trusted plugin boundary.
- Kept `POST /api/plugins/discover` read-only so operators can inspect discovered manifests and failures before store mutation.
- Kept gateway integration as an adapter instead of a control-plane fetcher; runtime synchronization can be promoted later without changing lifecycle ownership.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gateway dependency lockfile entry was missing**
- **Found during:** Final packaging review after Task 3
- **Issue:** `apps/acp-gateway/package.json` imported `@feudal/contracts`, but `pnpm-lock.yaml` did not yet include the `apps/acp-gateway` workspace importer entry.
- **Fix:** Added only the `apps/acp-gateway` `@feudal/contracts` lockfile hunk and left unrelated lockfile changes unstaged.
- **Files modified:** `pnpm-lock.yaml`
- **Verification:** `COREPACK_HOME=/tmp/corepack corepack pnpm install --lockfile-only --frozen-lockfile` passed.
- **Committed in:** `5d7811e`

**2. [Rule 2 - Missing Critical] Internal helper surface was too thin for phase-level must-haves**
- **Found during:** Phase-level artifact validation against `05-02-PLAN.md`
- **Issue:** The first catalog and adapter implementations passed behavior tests but did not provide enough internal query/conversion helpers for downstream consumers.
- **Fix:** Added catalog snapshot, lookup, ID/type list helpers, adapter metadata construction, single worker conversion, and single record filtering.
- **Files modified:** `apps/control-plane/src/services/plugin-extension-catalog.ts`, `apps/control-plane/src/services/plugin-extension-catalog.test.ts`, `apps/control-plane/src/routes/plugins.ts`, `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts`, `apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts`
- **Verification:** Focused affected tests and full Phase 5 focused suite passed.
- **Committed in:** `28930e5`

---

**Total deviations:** 2 auto-fixed (1 blocking packaging sync, 1 helper surface hardening).  
**Impact on plan:** Both fixes strengthen the planned integration surface without introducing marketplace, remote install, watcher, or sandbox behavior.

## Issues Encountered

No unresolved issues. The Vite production build still emits the existing chunk-size warning from earlier web dependencies; it remains non-blocking and unrelated to Phase 5 plugin code.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-extension-catalog.test.ts apps/control-plane/src/routes/plugins.test.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks`
  - Result: 3 files, 16 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/plugin-store.test.ts apps/control-plane/src/services/plugin-discovery.test.ts apps/control-plane/src/routes/plugins.test.ts apps/control-plane/src/services/plugin-extension-catalog.test.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks`
  - Result: 7 files, 62 tests passed.
- `COREPACK_HOME=/tmp/corepack corepack pnpm build`
  - Result: passed.
- `COREPACK_HOME=/tmp/corepack corepack pnpm install --lockfile-only --frozen-lockfile`
  - Result: passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 05 now has summaries for both plugin architecture plans and is ready for phase-level review and verification. Phase 08 can later build marketplace/ecosystem behavior on top of this local trusted lifecycle boundary.

## Self-Check: PASSED

- `apps/control-plane/src/routes/plugins.ts` exists and has 210 lines.
- `apps/control-plane/src/services/plugin-extension-catalog.ts` exists and has 61 lines.
- `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts` exists and has 78 lines.
- Plugin route, catalog, discovery, store, contract, and gateway adapter focused tests pass.
- Build and lockfile frozen validation pass.

---
*Phase: 05-plugin-architecture*
*Completed: 2026-05-02*
