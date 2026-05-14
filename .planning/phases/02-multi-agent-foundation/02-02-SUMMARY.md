# PLAN-02: Agent Registry And Discovery — Summary

**Phase:** 02-multi-agent-foundation
**Plan:** 02
**Status:** Complete with deviations
**Completed:** 2026-04-27

---

## Objective

Implement the Phase 2 dynamic agent registry: typed agent metadata, lifecycle operations, discovery filters, and registry HTTP endpoints.

## What Was Built

### 1. Registry contracts

- `apps/acp-gateway/src/agent-registry/types.ts`
  - Added `AgentStatus`, `AgentMetadata`, `AgentRegistration`, and `DiscoveryQuery` schemas
  - Added runtime validation helpers for registration input and metadata

### 2. Registry lifecycle and replay

- `apps/acp-gateway/src/agent-registry/registry.ts`
  - Added persistent and temporary agent storage
  - Added register/unregister lifecycle
  - Added heartbeat timestamp updates
  - Added status updates with replayable event records
  - Added event-store-driven restore flow

### 3. Discovery and server seeding

- `apps/acp-gateway/src/agent-registry/discovery.ts`
  - Added exact capability lookup
  - Added glob/regex capability matching
  - Added status and metadata filtering
  - Added watcher callbacks for registry change notifications
- `apps/acp-gateway/src/agent-registry/seed.ts`
  - Converted ACP manifests into dynamic registry registrations
- `apps/acp-gateway/src/server.ts`
  - Seeded the runtime registry from static ACP manifests on startup

### 4. Gateway API wiring

- `apps/acp-gateway/src/routes/agent-registry.ts`
  - Added register/unregister/get/list routes
  - Added status update endpoint
  - Added discovery query endpoint

## Files Modified

| File | Purpose |
|------|---------|
| `apps/acp-gateway/src/agent-registry/types.ts` | Registry schemas and query contracts |
| `apps/acp-gateway/src/agent-registry/registry.ts` | Lifecycle and replay logic |
| `apps/acp-gateway/src/agent-registry/discovery.ts` | Capability/status/metadata discovery |
| `apps/acp-gateway/src/agent-registry/seed.ts` | ACP manifest seeding adapter |
| `apps/acp-gateway/src/routes/agent-registry.ts` | Registry HTTP endpoints |
| `apps/acp-gateway/src/server.ts` | Shared registry wiring |

## Verification

- [x] `./node_modules/.bin/vitest run --config apps/acp-gateway/vitest.config.ts apps/acp-gateway/src/agent-registry/types.test.ts apps/acp-gateway/src/agent-registry/registry.test.ts apps/acp-gateway/src/agent-registry/discovery.test.ts`
- [x] Registration replay via event store abstraction verified
- [x] Temporary agents remain memory-only
- [x] Capability, status, and metadata discovery filters verified

## Deviations from Plan

1. **Gateway startup is seeded from static manifests**
   - The dynamic registry is active, but the legacy `/agents` ACP listing still comes from static manifest data

2. **Persistence wiring is abstracted, not yet connected to Postgres runtime boot**
   - Replay works through `AgentRegistryEventStore`
   - `createGatewayApp()` does not yet construct a Postgres-backed registry store from environment configuration

3. **HTTP route verification blocked by local dependency state**
   - Fastify-backed route tests could not be executed in this workspace because `fastify` is not installed in the active `node_modules`

4. **No commit created**
   - The workspace already contains extensive unrelated modifications, so this execution was recorded as working-tree changes only

## Next Steps

- Move seeded ACP `/agents` data behind the dynamic registry
- Add a Postgres-backed registry event-store adapter
- Add route-level registry tests once gateway dependencies are installed
