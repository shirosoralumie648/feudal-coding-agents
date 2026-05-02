---
phase: 04-analytics-platform
plan: 02
subsystem: api
tags: [analytics, fastify, sse, audit-trail, metrics]
requires:
  - phase: 04-analytics-platform
    provides: analytics contracts from 04-01
provides:
  - Pull-mode AnalyticsService with cached snapshots and listener emission
  - Fastify analytics snapshot, stream, and audit-trail routes
  - Control-plane server wiring for analytics collection
affects: [control-plane, web, analytics-platform]
tech-stack:
  added: []
  patterns: [service-with-listener-subscriptions, fastify-route-registration, sse-streaming]
key-files:
  created:
    - apps/control-plane/src/services/analytics-service.ts
    - apps/control-plane/src/services/analytics-service.test.ts
    - apps/control-plane/src/routes/analytics.ts
    - apps/control-plane/src/routes/analytics.test.ts
  modified:
    - apps/control-plane/src/server.ts
    - packages/contracts/src/analytics/types.ts
key-decisions:
  - "AnalyticsService depends on the TaskStore read surface so it can use OrchestratorService as the default data source."
  - "Analytics routes are exposed at both /analytics/* and /api/analytics/* for curl compatibility and Vite proxy compatibility."
patterns-established:
  - "SSE routes subscribe to MetricEventEmitter and clean up listeners on connection close."
requirements-completed: [ANM-01, ANM-02, ANM-04]
duration: 10 min
completed: 2026-05-02
---

# Phase 04 Plan 02: Analytics Service and Routes Summary

**Pull-mode metrics engine with snapshot, SSE stream, and searchable audit trail APIs**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-02T08:05:41Z
- **Completed:** 2026-05-02T08:15:23Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `AnalyticsService` with periodic polling, cached snapshots, listener notification, and optional snapshot persistence.
- Added `/analytics/snapshot`, `/analytics/stream`, and `/analytics/audit-trail` plus `/api/analytics/*` aliases.
- Added audit trail filtering by task, agent, event type, time range, and in-memory payload search.
- Wired analytics startup and shutdown into the control-plane Fastify app.

## Task Commits

1. **Task 1: Implement AnalyticsService** - `8eb442e` (feat)
2. **Task 2: Create /analytics/* Fastify routes** - `8eb442e` (feat)
3. **Task 3: Register analytics routes in server.ts** - `8eb442e` (feat)

## Files Created/Modified

- `apps/control-plane/src/services/analytics-service.ts` - Metrics polling engine and audit event loader.
- `apps/control-plane/src/services/analytics-service.test.ts` - Service coverage for metrics, listener emission, caching, and polling.
- `apps/control-plane/src/routes/analytics.ts` - Snapshot, SSE, and audit trail route registration.
- `apps/control-plane/src/routes/analytics.test.ts` - Route coverage for snapshot, stream, search, filters, and validation.
- `apps/control-plane/src/server.ts` - Analytics route and lifecycle wiring.
- `packages/contracts/src/analytics/types.ts` - Fixed token schema cycle for downstream package imports.

## Decisions Made

Default server wiring uses the `OrchestratorService` read methods as the analytics data source instead of creating a second memory store. That keeps metrics aligned with the task data actually served by the control plane.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Avoided duplicate default task store for analytics**
- **Found during:** Task 3 server wiring
- **Issue:** The plan suggested `service.store`, but `OrchestratorService` does not expose a store field. Creating a new lazy store would make memory-mode analytics observe a different store from the API.
- **Fix:** Typed `AnalyticsService` against the read surface and passed the service itself as the default source.
- **Files modified:** `apps/control-plane/src/services/analytics-service.ts`, `apps/control-plane/src/server.ts`
- **Verification:** Analytics route/service tests passed.
- **Committed in:** `8eb442e`

**2. [Rule 3 - Blocking] Removed analytics-to-root-contract circular runtime schema dependency**
- **Found during:** Task 1 verification
- **Issue:** Importing `SystemTokenUsageSummarySchema` from the package root inside analytics worked in package-local tests but failed when downstream apps imported from `@feudal/contracts`.
- **Fix:** Added an equivalent local token usage schema inside analytics contracts to avoid the root export cycle.
- **Files modified:** `packages/contracts/src/analytics/types.ts`
- **Verification:** Contracts and control-plane analytics tests passed together.
- **Committed in:** `8eb442e`

---

**Total deviations:** 2 auto-fixed (wiring correctness, circular import fix).
**Impact on plan:** No scope loss. The API is usable in the app and from curl-style `/analytics/*` paths.

## Issues Encountered

No unresolved issues. Snapshot persistence is implemented when an event store is injected; default memory-mode audit trail reads from task event history because the default server does not expose a shared event store instance.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 04-03. `AlertService` can subscribe to `AnalyticsService` snapshots and routes can build on the analytics contracts.

## Self-Check: PASSED

- `apps/control-plane/src/services/analytics-service.ts` exists and has 213 lines.
- `apps/control-plane/src/routes/analytics.ts` exists and has 221 lines.
- `apps/control-plane/src/server.ts` imports and calls `registerAnalyticsRoutes`.
- Verification passed: `COREPACK_HOME=/tmp/corepack corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/analytics/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/analytics.test.ts`
- Result: 4 test files, 43 tests passed.

---
*Phase: 04-analytics-platform*
*Completed: 2026-05-02*
