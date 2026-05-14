---
phase: 04-analytics-platform
plan: 03
subsystem: api
tags: [alerts, analytics, fastify, webhook, suppression]
requires:
  - phase: 04-analytics-platform
    provides: analytics service and metric emitter from 04-02
provides:
  - AlertService rule evaluation engine
  - Default alert rules JSON configuration
  - Alert state, pending notification, and rule API routes
affects: [control-plane, web, analytics-platform]
tech-stack:
  added: []
  patterns: [metric-listener-alerts, in-memory-notification-queue, webhook-dispatch]
key-files:
  created:
    - apps/control-plane/config/alert-rules.json
    - apps/control-plane/src/services/alert-service.ts
    - apps/control-plane/src/services/alert-service.test.ts
    - apps/control-plane/src/routes/alerts.ts
    - apps/control-plane/src/routes/alerts.test.ts
  modified:
    - apps/control-plane/src/server.ts
key-decisions:
  - "Alert routes are exposed at both /alerts/* and /api/alerts/* for direct API and web proxy use."
  - "AlertService accepts MetricEventEmitter instead of concrete AnalyticsService for testability and loose coupling."
patterns-established:
  - "Alert services subscribe to metric snapshots and clean up subscriptions during server close."
requirements-completed: [ANM-02]
duration: 5 min
completed: 2026-05-02
---

# Phase 04 Plan 03: Analytics Alert Service Summary

**Metric-driven alert rules with suppression, auto-resolve, in-app queue, webhook dispatch, and Fastify routes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-02T08:15:23Z
- **Completed:** 2026-05-02T08:22:35Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added five default alert rules covering task backlog, recovery pressure, approval backlog, error rate, and approval latency.
- Added `AlertService` with metric comparisons, five-minute suppression, auto-resolve events, in-app queue, and Slack/Discord-style webhook payloads.
- Added `/alerts/state`, `/alerts/pending`, and `/alerts/rules` plus `/api/alerts/*` aliases.
- Wired alert startup and shutdown into the control-plane server.

## Task Commits

1. **Task 1: Create alert rules configuration file** - `b844a65` (feat)
2. **Task 2: Implement AlertService** - `b844a65` (feat)
3. **Task 3: Create alert API routes and integrate into server** - `b844a65` (feat)

## Files Created/Modified

- `apps/control-plane/config/alert-rules.json` - Default alert rule configuration.
- `apps/control-plane/src/services/alert-service.ts` - Alert evaluation, suppression, queue, and webhook engine.
- `apps/control-plane/src/services/alert-service.test.ts` - Alert behavior coverage.
- `apps/control-plane/src/routes/alerts.ts` - Alert read APIs.
- `apps/control-plane/src/routes/alerts.test.ts` - Route coverage for state, pending alerts, and rules.
- `apps/control-plane/src/server.ts` - Alert service lifecycle and route wiring.

## Decisions Made

The alert engine depends on `MetricEventEmitter` rather than a concrete `AnalyticsService`, which preserves the planned subscription contract while keeping tests lightweight.

## Deviations from Plan

None - plan executed as specified, with `/api/alerts/*` aliases added to match the web proxy route pattern.

## Issues Encountered

The control-plane package has no `build` script, so verification used the root Vitest workspace command instead of `pnpm --filter control-plane build`.

## User Setup Required

Optional: set `ALERT_WEBHOOK_URL` to enable webhook delivery for rules that include the `webhook` channel.

## Next Phase Readiness

Ready for 04-04. The web app can fetch alert state/pending events and analytics snapshots through `/api/alerts/*` and `/api/analytics/*`.

## Self-Check: PASSED

- `apps/control-plane/src/services/alert-service.ts` exists and has 274 lines.
- `apps/control-plane/src/routes/alerts.ts` exists and has 58 lines.
- `apps/control-plane/config/alert-rules.json` exists and has 58 lines.
- Config validation passed: `OK: 5 rules`.
- Verification passed: `COREPACK_HOME=/tmp/corepack corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/analytics.test.ts apps/control-plane/src/services/alert-service.test.ts apps/control-plane/src/routes/alerts.test.ts`
- Result: 4 test files, 29 tests passed.

---
*Phase: 04-analytics-platform*
*Completed: 2026-05-02*
