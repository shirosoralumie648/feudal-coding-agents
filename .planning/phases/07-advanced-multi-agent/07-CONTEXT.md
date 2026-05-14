# Phase 7: Advanced Multi-Agent - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `$gsd-discuss-phase 7 --auto` fallback; `gsd-sdk` unavailable, decisions inferred from roadmap, Phase 2 context, codebase maps, and current source.

<domain>
## Phase Boundary

Deliver advanced multi-agent coordination on top of the Phase 2 ACP gateway foundation. This phase covers distributed task assignment semantics, load-aware scheduling, performance bottleneck analysis, large local fleet handling, and automatic recovery of assigned work when an agent becomes unhealthy.

The current runtime is still a local, process-scoped MVP. Phase 7 must expose clear scheduler and analysis contracts that can later be backed by a distributed store, but it must not introduce Redis, external queues, SaaS schedulers, multi-tenant cluster management, or claims of durable multi-node coordination.
</domain>

<decisions>
## Implementation Decisions

### Assignment and Scheduling Scope
- **D-01:** Add an ACP gateway scheduling layer rather than changing control-plane workflow semantics. The scheduler selects registered ACP agents for work items and records process-local assignments.
- **D-02:** Assignment input is task-oriented and capability-based: `taskId`, `requiredCapabilities`, `priority`, optional `estimatedCost`, optional metadata constraints.
- **D-03:** Candidate agents must be filtered by required capabilities, agent status, and heartbeat health before scoring. `unhealthy` and `offline` agents are never selected.
- **D-04:** Load balancing is capacity-aware. Agent metadata may define `maxConcurrentTasks` and `schedulingWeight`; missing values fall back to conservative defaults.
- **D-05:** The default scoring strategy is deterministic: prefer lower load ratio, healthier status, lower missed heartbeat count, then lexical `agentId` for stable ties.

### Fleet Scale Semantics
- **D-06:** "Large-scale agent cluster" means bounded local fleet handling in this phase. Tests should prove hundreds of registered agents can be ranked and assigned without nested fan-out or route timeouts.
- **D-07:** Scheduler state stays in memory, scoped to the Fastify app instance. Future persistent/distributed stores are deferred.
- **D-08:** Assignment records expose enough data for later migration: assignment id, task id, agent id, capabilities, status, timestamps, score, and reason.

### Bottleneck Analysis
- **D-09:** Add a bottleneck analyzer over registry, health, scheduler load, and assignment backlog. It should identify overloaded agents, missing required capabilities, unhealthy assigned agents, and fleet capacity saturation.
- **D-10:** Bottleneck reports are derived snapshots, not stored analytics events. They expose severity, affected agents/tasks, and actionable recommendations.
- **D-11:** Response-time and token-cost analysis remain out of scope unless real runtime metadata already exists.

### Failure Recovery
- **D-12:** Scheduler listens to health status changes and automatically reassigns active assignments from agents that become `unhealthy`.
- **D-13:** If no healthy replacement exists, assignment status becomes `operator_attention` with a reason; the task is not silently dropped.
- **D-14:** Existing `FailoverHandler` remains supported for Phase 2 health endpoints. Phase 7 may share assignment data with it or keep scheduler recovery separate, but tests must prove scheduler-owned assignments recover.

### API Surface
- **D-15:** Add ACP gateway routes under `/agent-scheduler/*`, not control-plane routes, because the scheduler owns execution-plane agent selection.
- **D-16:** Routes must support assignment creation, assignment release, load inspection, and bottleneck report retrieval.
- **D-17:** Existing registry, messaging, health, runs, and control-plane APIs must remain backward compatible.

### Agent's Discretion
- Exact route names and response shapes may follow local Fastify/Zod style.
- The planner may split implementation into one scheduler core plan and one API/server wiring plan if dependency ordering is clearer.
- Frontend UI is not required for Phase 7 because the roadmap scope is coordination functionality, not operator console visualization.
</decisions>

<canonical_refs>
## Canonical References

### Phase Scope
- `.planning/ROADMAP.md` - Phase 7 goal, MAC-03/ANM-03 requirements, success criteria, and Phase 2 dependency.
- `.planning/REQUIREMENTS.md` - Multi-agent and analytics requirement IDs.
- `.planning/PROJECT.md` - Local MVP boundary and explicit out-of-scope SaaS/distributed expansion.

### Prior Phase Decisions
- `.planning/phases/02-multi-agent-foundation/02-CONTEXT.md` - Phase 2 deferred distributed assignment and cluster management to Phase 7.
- `.planning/phases/02-multi-agent-foundation/02-03-SUMMARY.md` - Existing heartbeat monitor and failover handler behavior.
- `.planning/phases/04-analytics-platform/04-CONTEXT.md` - Analytics scope and pull-mode derived metric style.
- `.planning/phases/06-performance-optimization/06-CONTEXT.md` - In-process-only performance/caching constraint and current local MVP boundaries.

### Architecture Maps
- `.planning/codebase/ARCHITECTURE.md` - ACP gateway registry/messaging/health modules and process-local warning.
- `.planning/codebase/INTEGRATIONS.md` - Current ACP gateway route registrations.
- `.planning/codebase/STACK.md` - pnpm/Vitest/Fastify/TypeScript stack and commands.
- `.planning/codebase/CONCERNS.md` - Process-local registry/health caveat and verification guidance.

### Code Integration Points
- `apps/acp-gateway/src/agent-registry/registry.ts` - Registered agent source of truth.
- `apps/acp-gateway/src/agent-registry/discovery.ts` - Capability/status filtering.
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts` - Health snapshots and status-change events.
- `apps/acp-gateway/src/agent-health/failover-handler.ts` - Existing Phase 2 reassignment pattern.
- `apps/acp-gateway/src/routes/agent-health.ts` - Health route style.
- `apps/acp-gateway/src/routes/agent-registry.ts` - Registry route style.
- `apps/acp-gateway/src/server.ts` - ACP gateway service composition and route registration.
</canonical_refs>

<deferred>
## Deferred Ideas

- Persistent distributed scheduler state across processes.
- External queue brokers, Redis, consensus, leases, or sharding.
- Machine-learning based agent matching.
- Frontend scheduling dashboard.
- Real token/cost bottleneck analysis without provider metadata.
</deferred>

---

*Phase: 07-advanced-multi-agent*
*Context gathered: 2026-05-04 via file-based GSD fallback*
