# Phase 7: Advanced Multi-Agent - Patterns

**Generated:** 2026-05-04
**Scope:** Existing code patterns for Phase 7 implementation.

## Pattern Complete

## ACP Gateway Service Composition

Closest analogs:

- `apps/acp-gateway/src/server.ts`
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`

Pattern:

- Construct shared process-local services once in `createGatewayApp()`.
- Inject those services into route registration functions.
- Start/stop background monitor behavior through Fastify lifecycle hooks.

Use for:

- `apps/acp-gateway/src/agent-scheduler/scheduler.ts`
- `apps/acp-gateway/src/routes/agent-scheduler.ts`
- `apps/acp-gateway/src/server.ts`

Expected adaptation:

- Construct `AgentScheduler` from registry, discovery, and monitor.
- Register scheduler routes in the gateway app.
- Avoid background timers beyond existing heartbeat monitor.

## Fastify Route Injection

Closest analogs:

- `apps/acp-gateway/src/routes/agent-health.ts`
- `apps/acp-gateway/src/routes/agent-registry.ts`
- `apps/acp-gateway/src/routes/runs.ts`

Pattern:

- Route modules export `register*Routes(app, options)`.
- Request bodies and params are parsed with Zod.
- Domain errors return deterministic `400`, `404`, or `409` responses.

Use for:

- `apps/acp-gateway/src/routes/agent-scheduler.ts`

Expected adaptation:

- Add `POST /agent-scheduler/assign`.
- Add `POST /agent-scheduler/:assignmentId/release`.
- Add `GET /agent-scheduler/assignments`.
- Add `GET /agent-scheduler/loads`.
- Add `GET /agent-scheduler/bottlenecks`.

## Capability Discovery and Health Filtering

Closest analogs:

- `apps/acp-gateway/src/agent-registry/discovery.ts`
- `apps/acp-gateway/src/agent-health/failover-handler.ts`

Pattern:

- Discovery filters candidate agents by capability and status.
- Failover excludes the unhealthy source agent and chooses a same-capability replacement.

Use for:

- `apps/acp-gateway/src/agent-scheduler/scheduler.ts`
- `apps/acp-gateway/src/agent-scheduler/bottleneck-analyzer.ts`

Expected adaptation:

- Candidate filtering should require all requested capabilities.
- Scoring should account for capacity ratio, health, missed heartbeat count, and stable tie-breaks.
- Metadata-derived scheduling values should be parsed defensively.

## Process-Local State and Derived Snapshots

Closest analogs:

- `HeartbeatMonitor.getAllAgentHealth()`
- `HeartbeatMonitor.getEvents()`
- `FailoverHandler.getTasksByAgent()`

Pattern:

- Runtime services expose derived snapshots from in-memory maps.
- Snapshots are used for routes and tests, not persisted as product truth.

Use for:

- Scheduler assignments.
- Agent load snapshots.
- Bottleneck reports.

Expected adaptation:

- Keep assignments in a `Map`.
- Return plain JSON-friendly objects.
- Include timestamps and status so future persistence can be added without changing route intent.
