---
phase: 07-advanced-multi-agent
plan: 03
subsystem: scheduler-routes
tags: [fastify, routes, scheduler, vitest]
requires:
  - phase: 07-advanced-multi-agent
    plan: 01
    provides: AgentScheduler
  - phase: 07-advanced-multi-agent
    plan: 02
    provides: BottleneckAnalyzer
provides:
  - /agent-scheduler/assign route
  - /agent-scheduler/assignments route
  - /agent-scheduler/loads route
  - /agent-scheduler/bottlenecks route
  - /agent-scheduler/:assignmentId/release route
affects: [acp-gateway, fastify]
tech-stack:
  added: []
  patterns: [fastify-route-injection, zod-validation, app-scoped-service]
key-files:
  created:
    - apps/acp-gateway/src/routes/agent-scheduler.ts
    - apps/acp-gateway/src/routes/agent-scheduler.test.ts
  modified:
    - apps/acp-gateway/src/server.ts
key-decisions:
  - "Scheduler APIs live under the ACP gateway because this is execution-plane agent selection."
  - "Invalid assignment payloads return 400 and unschedulable assignments return 409 with operator-attention state."
  - "createGatewayApp constructs scheduler/analyzer services and seeds static manifests before load snapshots are inspected."
patterns-established:
  - "Default ACP gateway composition wires registry, discovery, health, scheduler, analyzer, and routes in one app-scoped graph."
requirements-completed: [MAC-03, ANM-03]
completed: 2026-05-04
---

# Phase 07 Plan 03: Scheduler Routes Summary

**ACP gateway exposes scheduler assignment, load, release, and bottleneck APIs.**

## Accomplishments

- Added `POST /agent-scheduler/assign` with strict Zod payload validation.
- Added `GET /agent-scheduler/assignments`, `GET /agent-scheduler/loads`, and `GET /agent-scheduler/bottlenecks`.
- Added `POST /agent-scheduler/:assignmentId/release` for active assignment release.
- Wired `AgentScheduler` and `BottleneckAnalyzer` into `createGatewayApp()`.
- Added route tests for assignment lifecycle, invalid payloads, unschedulable requests, and default app manifest seeding.

## Files Created/Modified

- `apps/acp-gateway/src/routes/agent-scheduler.ts` - Scheduler route module.
- `apps/acp-gateway/src/routes/agent-scheduler.test.ts` - Route-level Fastify injection tests.
- `apps/acp-gateway/src/server.ts` - Default service wiring.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/acp-gateway/src/agent-scheduler/scheduler.test.ts apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.test.ts apps/acp-gateway/src/routes/agent-scheduler.test.ts --pool=forks`
  - Result: passed, 3 test files and 14 tests.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/acp-gateway/src --pool=forks`
  - Result: passed, 18 test files and 106 tests.

## Next Phase Readiness

Ready for Phase 07 verification and then Phase 08 plugin ecosystem work.
