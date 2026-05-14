---
phase: 07-advanced-multi-agent
plan: 01
subsystem: agent-scheduler
tags: [multi-agent, scheduling, capacity, vitest]
requires:
  - phase: 02-multi-agent-foundation
    provides: ACP agent registry, discovery, and heartbeat health snapshots
provides:
  - Process-local AgentScheduler core
  - Strict task assignment request schema
  - Capacity-aware load snapshots
  - Deterministic scheduling tie-breaks
affects: [acp-gateway, agent-scheduler]
tech-stack:
  added: []
  patterns: [in-memory-service, zod-contract, deterministic-scheduling]
key-files:
  created:
    - apps/acp-gateway/src/agent-scheduler/types.ts
    - apps/acp-gateway/src/agent-scheduler/scheduler.ts
    - apps/acp-gateway/src/agent-scheduler/scheduler.test.ts
key-decisions:
  - "Scheduling state is process-local and app-scoped for Phase 7."
  - "Agents are filtered by required capabilities, registry status, metadata constraints, and heartbeat health before scoring."
  - "Capacity uses maxConcurrentTasks and schedulingWeight metadata with conservative defaults."
patterns-established:
  - "Scheduler scoring is deterministic: load ratio, health/status penalties, missed heartbeat count, then lexical agentId tie-break."
requirements-completed: [MAC-03]
completed: 2026-05-04
---

# Phase 07 Plan 01: Scheduler Core Summary

**ACP gateway now has a load-aware assignment core for registered agents.**

## Accomplishments

- Added strict task assignment request and scheduler response contracts.
- Implemented `AgentScheduler.assignTask()` with healthy/capable agent filtering.
- Added capacity-aware `getAgentLoads()` snapshots using metadata-defined capacity.
- Added deterministic score ordering and stable agent-id tie-breaks.
- Covered local fleet scale with a 250-agent bounded performance fixture.

## Files Created/Modified

- `apps/acp-gateway/src/agent-scheduler/types.ts` - Assignment, load, recovery, and bottleneck contracts.
- `apps/acp-gateway/src/agent-scheduler/scheduler.ts` - Scheduler core and capacity scoring.
- `apps/acp-gateway/src/agent-scheduler/scheduler.test.ts` - Unit tests for capability filtering, load balancing, tie-breaks, capacity, and local scale.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/acp-gateway/src/agent-scheduler/scheduler.test.ts apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.test.ts apps/acp-gateway/src/routes/agent-scheduler.test.ts --pool=forks`
  - Result: passed, including Plan 01 scheduler coverage.

## Next Phase Readiness

Ready for recovery and bottleneck analysis on top of the scheduler core.
