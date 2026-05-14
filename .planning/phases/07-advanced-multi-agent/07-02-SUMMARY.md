---
phase: 07-advanced-multi-agent
plan: 02
subsystem: scheduler-recovery
tags: [multi-agent, failover, bottlenecks, vitest]
requires:
  - phase: 07-advanced-multi-agent
    plan: 01
    provides: AgentScheduler assignments and load snapshots
provides:
  - Automatic scheduler-owned assignment recovery
  - Operator-attention fallback for unrecoverable assignments
  - BottleneckAnalyzer derived reports
affects: [acp-gateway, agent-scheduler, agent-health]
tech-stack:
  added: []
  patterns: [derived-analysis, health-event-listener, fail-closed-recovery]
key-files:
  created:
    - apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.ts
    - apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.test.ts
  modified:
    - apps/acp-gateway/src/agent-scheduler/scheduler.ts
    - apps/acp-gateway/src/agent-scheduler/scheduler.test.ts
key-decisions:
  - "Scheduler-owned recovery listens to unhealthy heartbeat status changes and does not replace the Phase 2 FailoverHandler."
  - "Unrecoverable assignments move to operator_attention rather than disappearing."
  - "Bottleneck reports are derived snapshots and do not persist new analytics events."
patterns-established:
  - "Bottleneck findings include severity, category, affected ids, and recommendation."
requirements-completed: [MAC-03, ANM-03]
completed: 2026-05-04
---

# Phase 07 Plan 02: Recovery and Bottleneck Summary

**Scheduler assignments now recover from unhealthy agents and expose actionable bottleneck snapshots.**

## Accomplishments

- Added recovery for active assignments when an assigned agent becomes unhealthy.
- Ensured replacement selection excludes the failed source agent and respects capability/health/capacity filters.
- Added `operator_attention` state with explicit reasons when no replacement is available.
- Added `BottleneckAnalyzer` for overloaded agents, missing capability capacity, unhealthy assignments, and fleet saturation.
- Kept analysis as a read-only derived snapshot over registry, health, and scheduler state.

## Files Created/Modified

- `apps/acp-gateway/src/agent-scheduler/scheduler.ts` - Recovery logic and health event listener.
- `apps/acp-gateway/src/agent-scheduler/scheduler.test.ts` - Recovery and operator-attention tests.
- `apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.ts` - Derived bottleneck report service.
- `apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.test.ts` - Bottleneck coverage.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/acp-gateway/src/agent-scheduler/scheduler.test.ts apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.test.ts apps/acp-gateway/src/routes/agent-scheduler.test.ts --pool=forks`
  - Result: passed, including Plan 02 recovery and bottleneck coverage.

## Next Phase Readiness

Ready for ACP gateway route exposure and default server wiring.
