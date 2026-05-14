# PLAN-03: Heartbeat Monitoring And Failover — Summary

**Phase:** 02-multi-agent-foundation
**Plan:** 03
**Status:** Complete with deviations
**Completed:** 2026-04-27

---

## Objective

Implement the Phase 2 agent health subsystem: heartbeat configuration, missed-heartbeat evaluation, active probing, failover reassignment, and health HTTP endpoints.

## What Was Built

### 1. Health contracts

- `apps/acp-gateway/src/agent-health/types.ts`
  - Added heartbeat configuration schema
  - Added health status and event schemas
  - Added failover result/config types

### 2. Heartbeat monitoring core

- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
  - Added heartbeat recording
  - Added passive missed-heartbeat checks
  - Added unhealthy status promotion after configured misses
  - Added alert callback support
  - Added active probing through the message router
  - Added in-memory recent event tracking

### 3. Automatic failover

- `apps/acp-gateway/src/agent-health/failover-handler.ts`
  - Added task-to-agent assignment tracking
  - Added healthy replacement selection using capability discovery
  - Added operator-attention fallback when no replacement exists
  - Subscribed failover handling to unhealthy monitor events

### 4. Gateway API wiring

- `apps/acp-gateway/src/routes/agent-health.ts`
  - Added heartbeat ingestion endpoint
  - Added per-agent and fleet health endpoints
  - Added active probe endpoint
  - Added recent health event endpoint
  - Added manual failover endpoint
- `apps/acp-gateway/src/server.ts`
  - Registered health routes
  - Started and stopped the heartbeat monitor with the Fastify lifecycle

## Files Modified

| File | Purpose |
|------|---------|
| `apps/acp-gateway/src/agent-health/types.ts` | Health schemas and result types |
| `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts` | Heartbeat evaluation and probing |
| `apps/acp-gateway/src/agent-health/failover-handler.ts` | Task reassignment logic |
| `apps/acp-gateway/src/routes/agent-health.ts` | Health HTTP endpoints |
| `apps/acp-gateway/src/server.ts` | Monitor lifecycle and shared service wiring |

## Verification

- [x] `./node_modules/.bin/vitest run --config apps/acp-gateway/vitest.config.ts apps/acp-gateway/src/agent-health/types.test.ts apps/acp-gateway/src/agent-health/heartbeat-monitor.test.ts apps/acp-gateway/src/agent-health/failover-handler.test.ts`
- [x] Three missed heartbeats promote an agent to `unhealthy`
- [x] Alert callback fires on unhealthy transitions
- [x] Capability-based failover reassignment verified

## Deviations from Plan

1. **Active probe is delivery-based, not response-roundtrip based**
   - The current probe confirms router delivery to the target mailbox
   - It does not yet wait for a dedicated `pong` response envelope

2. **Failover notification is internal-only**
   - Task reassignment state is updated in the handler
   - No external task scheduler or operator channel is wired yet

3. **HTTP route verification blocked by local dependency state**
   - Fastify-backed route tests could not be executed in this workspace because `fastify` is not installed in the active `node_modules`

4. **No commit created**
   - The workspace already contains extensive unrelated modifications, so this execution was recorded as working-tree changes only

## Next Steps

- Implement true request/response active probes with timeout handling
- Connect failover decisions to task orchestration and operator notification flows
- Add route-level health tests once gateway dependencies are installed
