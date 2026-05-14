---
phase: 06-performance-optimization
plan: 02
subsystem: read-model
tags: [read-model, analytics, audit-trail, n-plus-one, replay]
requires:
  - phase: 04-analytics-platform
    provides: Audit trail and analytics loading surface
provides:
  - Bulk audit event loading through TaskStore
  - Persisted read-model listAuditEventsAfter implementation
  - AnalyticsService bulk audit-event preference with fallback compatibility
  - Lightweight task existence checks for event, run, and artifact reads
affects: [control-plane, persistence, analytics, replay]
tech-stack:
  added: []
  patterns: [projection-level-bulk-read, fallback-compatible-source-method]
key-files:
  modified:
    - apps/control-plane/src/store.ts
    - apps/control-plane/src/config.ts
    - apps/control-plane/src/persistence/task-read-model.ts
    - apps/control-plane/src/persistence/task-read-model.test.ts
    - apps/control-plane/src/services/analytics-service.ts
    - apps/control-plane/src/services/analytics-service.test.ts
    - apps/control-plane/src/routes/replay.test.ts
key-decisions:
  - "Analytics audit loading prefers one bulk source method and keeps the old per-task fallback for compatible sources."
  - "Missing task event, run, and artifact reads still return undefined and keep route response shapes stable."
  - "Projection rebuild checkpoint semantics remain the source of truth for persisted recovery."
patterns-established:
  - "Read optimizations happen at projection/source boundaries instead of stale API response caching."
requirements-completed: [PSC-03, PSC-01]
duration: 25 min
completed: 2026-05-04
---

# Phase 06 Plan 02: Read-Model Fan-Out Reduction Summary

**Analytics and replay reads now avoid avoidable task-by-task fan-out.**

## Performance

- **Started:** 2026-05-04T12:50:00+08:00
- **Completed:** 2026-05-04T13:30:00+08:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added `TaskStore.listAuditEventsAfter(cursor?: number)` and implementations for memory, lazy, and persisted stores.
- Updated `AnalyticsService` to prefer the bulk audit-event method when available.
- Preserved the previous per-task fallback path for older task sources.
- Added lightweight `taskExists()` checks so event, run, and artifact reads no longer hydrate full task projections just to test existence.
- Added regression coverage for bulk event ordering, cursor behavior, missing-task semantics, and projection checkpoints.

## Task Commits

1. **Task 1: Add bulk audit event source to TaskStore** - pending in Phase 6 closeout commit
2. **Task 2: Implement persisted bulk audit event loading and lightweight existence checks** - pending in Phase 6 closeout commit
3. **Task 3: Preserve replay route behavior and checkpoint correctness** - pending in Phase 6 closeout commit

## Files Created/Modified

- `apps/control-plane/src/store.ts` - TaskStore bulk audit method and MemoryTaskStore implementation.
- `apps/control-plane/src/config.ts` - Lazy store delegation for bulk audit loading.
- `apps/control-plane/src/persistence/task-read-model.ts` - Persisted bulk loading and lightweight existence checks.
- `apps/control-plane/src/persistence/task-read-model.test.ts` - Bulk audit, missing-task, replay, and checkpoint tests.
- `apps/control-plane/src/services/analytics-service.ts` - Bulk audit source preference.
- `apps/control-plane/src/services/analytics-service.test.ts` - Bulk path and fallback path tests.
- `apps/control-plane/src/routes/replay.test.ts` - Route-level missing-task regression tests.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts --pool=forks`
  - Result: passed in the Phase 6 focused slice.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts --pool=forks`
  - Result: previously passed, 5 files and 37 tests.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks`
  - Result: 9 files, 68 tests passed.

## User Setup Required

None.

## Next Phase Readiness

Ready for Phase 6 verification. The N+1 requirement is addressed without adding external cache infrastructure.
