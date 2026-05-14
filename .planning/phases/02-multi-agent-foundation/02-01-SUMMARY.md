# PLAN-01: Agent Communication Protocol — Summary

**Phase:** 02-multi-agent-foundation
**Plan:** 01
**Status:** Complete with deviations
**Completed:** 2026-04-27

---

## Objective

Implement the Phase 2 agent communication protocol: JSON-RPC 2.0 message models, protocol helpers, mailbox routing, and ACP gateway messaging routes.

## What Was Built

### 1. Protocol contracts and helpers

- `apps/acp-gateway/src/agent-protocol/types.ts`
  - Added JSON-RPC request, notification, response, and error schemas
  - Added route typing for direct, broadcast, and capability-based delivery
- `apps/acp-gateway/src/agent-protocol/json-rpc.ts`
  - Added request/notification/response/error constructors
  - Added parsing and request/response type guards

### 2. Message routing core

- `apps/acp-gateway/src/agent-protocol/message-router.ts`
  - Added mailbox-backed direct delivery
  - Added broadcast delivery excluding the sender
  - Added capability-pattern routing (`code-*`, `RegExp`)
  - Added pluggable audit logging hook and pending mailbox reads

### 3. Gateway API wiring

- `apps/acp-gateway/src/routes/agent-messaging.ts`
  - Added direct send endpoint
  - Added broadcast endpoint
  - Added capability-targeted send endpoint
  - Added mailbox retrieval endpoint
- `apps/acp-gateway/src/server.ts`
  - Registered messaging routes with a shared router instance

## Files Modified

| File | Purpose |
|------|---------|
| `apps/acp-gateway/src/agent-protocol/types.ts` | JSON-RPC protocol schemas |
| `apps/acp-gateway/src/agent-protocol/json-rpc.ts` | Message creation and parsing |
| `apps/acp-gateway/src/agent-protocol/message-router.ts` | Mailbox delivery and routing |
| `apps/acp-gateway/src/routes/agent-messaging.ts` | Messaging HTTP endpoints |
| `apps/acp-gateway/src/server.ts` | Route registration and shared runtime wiring |

## Verification

- [x] `./node_modules/.bin/vitest run --config apps/acp-gateway/vitest.config.ts apps/acp-gateway/src/agent-protocol/types.test.ts apps/acp-gateway/src/agent-protocol/json-rpc.test.ts apps/acp-gateway/src/agent-protocol/message-router.test.ts`
- [x] Direct mailbox delivery verified
- [x] Broadcast fan-out verified
- [x] Capability-pattern routing verified

## Deviations from Plan

1. **Audit persistence abstraction differs from the plan**
   - Implemented a pluggable audit store interface on `AgentMessageRouter`
   - Did not wire router audit events directly into `packages/persistence/src/event-store.ts` in this pass

2. **HTTP route verification blocked by local dependency state**
   - Fastify-backed route tests could not be executed in this workspace because `fastify` is not installed in the active `node_modules`

3. **No commit created**
   - The workspace already contains extensive unrelated modifications, so this execution was recorded as working-tree changes only

## Next Steps

- Wire router audit events into the shared persistence event store
- Add route-level Fastify tests once gateway dependencies are installed
