---
phase: 06-performance-optimization
plan: 01
subsystem: metrics
tags: [metrics, cache, fastify, performance, vitest]
requires:
  - phase: 04-analytics-platform
    provides: Existing analytics and route aggregation patterns
provides:
  - App-scoped MetricsService with short in-process aggregate cache
  - Default /metrics route wiring through createControlPlaneApp
  - Explicit zero placeholder token metrics
  - Bounded local metrics route performance coverage
affects: [control-plane, metrics, performance]
tech-stack:
  added: []
  patterns: [in-process-cache, app-scoped-service, fastify-route-injection]
key-files:
  created:
    - apps/control-plane/src/services/metrics-service.ts
    - apps/control-plane/src/services/metrics-service.test.ts
    - apps/control-plane/src/routes/metrics.test.ts
  modified:
    - apps/control-plane/src/routes/metrics.ts
    - apps/control-plane/src/server.ts
key-decisions:
  - "Metrics cache is per MetricsService instance, ttlMs defaults to 1000, and refresh can be forced."
  - "Token metrics remain explicit zero placeholders until real token metadata exists."
  - "The 200ms target is represented by a bounded local fixture, not an external benchmark."
patterns-established:
  - "Default app routes should receive app-scoped services rather than silently falling back to unavailable responses."
requirements-completed: [PSC-01]
duration: 20 min
completed: 2026-05-04
---

# Phase 06 Plan 01: Metrics Cache and Route Wiring Summary

**Default control-plane metrics are now observable and locally cached.**

## Performance

- **Started:** 2026-05-04T12:40:00+08:00
- **Completed:** 2026-05-04T13:30:00+08:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `MetricsService` to calculate task and run aggregates from the app-scoped task source.
- Added short-lived in-process caching with `getMetrics({ refresh })` and `refreshMetrics()`.
- Wired `createControlPlaneApp()` so the default `/metrics` route no longer returns `metrics_unavailable`.
- Preserved direct route fallback behavior for tests and unsupported standalone registration.
- Kept `/metrics/tokens` as an explicit all-zero placeholder.
- Added a bounded local fixture proving cached `GET /metrics` stays below the 200ms target.

## Task Commits

1. **Task 1: Add MetricsService with bounded in-process cache** - pending in Phase 6 closeout commit
2. **Task 2: Wire metrics routes and default app dependency** - pending in Phase 6 closeout commit
3. **Task 3: Add bounded performance assertion for local metrics fixture** - pending in Phase 6 closeout commit

## Files Created/Modified

- `apps/control-plane/src/services/metrics-service.ts` - Metrics aggregate service and cache.
- `apps/control-plane/src/services/metrics-service.test.ts` - Cache, refresh, TTL, and aggregate tests.
- `apps/control-plane/src/routes/metrics.ts` - Route now consumes an injected metrics service.
- `apps/control-plane/src/routes/metrics.test.ts` - Fallback, default app, token placeholder, and bounded fixture tests.
- `apps/control-plane/src/server.ts` - Constructs and registers app-scoped `MetricsService`.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts --pool=forks`
  - Result: passed in the Phase 6 focused slice.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks`
  - Result: 9 files, 68 tests passed.

## User Setup Required

None.

## Next Phase Readiness

Ready for Phase 6 verification. Metrics are local-only and do not introduce Redis or external monitoring infrastructure.
