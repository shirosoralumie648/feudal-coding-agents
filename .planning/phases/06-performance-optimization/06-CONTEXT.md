# Phase 6: Performance Optimization - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver performance optimization and security hardening for the existing local Feudal Coding Agents MVP. This phase should make current APIs, projections, metrics, validation, and security scan paths more reliable and measurable. It should not introduce new product surfaces, external cache infrastructure, multi-tenant security, public auth, or a distributed runtime architecture.

</domain>

<decisions>
## Implementation Decisions

### Performance Scope and Measurement
- **D-01:** Treat Phase 6 as targeted hardening of existing hot paths, not a broad rewrite. Prioritize code paths already called by the default apps: control-plane task/replay/metrics routes, Postgres read models, analytics polling, and ACP gateway run projections.
- **D-02:** Use tests and small benchmark-style assertions around known expensive paths before refactors. Performance claims should be tied to observable checks, not just code movement.
- **D-03:** The roadmap target of response time under 200ms should be applied to bounded local route/projection scenarios with realistic fixture sizes, not promised for arbitrary production-scale datasets.
- **D-04:** Keep cache strategy in-process for this phase unless a plan proves existing code already requires an external cache. Do not add Redis, queues, CDN, or distributed cache topology in Phase 6.

### Query and Projection Optimization
- **D-05:** Focus N+1 work on persisted read-model and route patterns where one user action can fan out into repeated task/run/artifact/operator queries.
- **D-06:** Prefer projection-level query consolidation and existing table/index improvements over caching stale API responses. Event-sourced projections should remain the source of truth.
- **D-07:** Preserve rebuild correctness before optimizing. Any query optimization in `task-read-model.ts` or `run-read-model.ts` must keep projection checkpoint semantics and replay behavior intact.
- **D-08:** Large concentration files may be split only when it directly improves testability or performance work. Avoid broad cosmetic refactors.

### Metrics and Observability
- **D-09:** Wire `/metrics` to the same app-scoped task store/service used by the control plane instead of leaving the default route in `metrics_unavailable`.
- **D-10:** Token metrics remain placeholder unless the phase can connect them to real run metadata without inventing unavailable provider data.
- **D-11:** Analytics polling and metrics routes should avoid repeatedly recomputing expensive aggregates when cached snapshots already exist or when store-level queries can provide the same data directly.

### Security and Validation
- **D-12:** Promote the existing security scanner and sensitive-info detector from library-only code into an explicit enforcement point on the task execution path.
- **D-13:** Scanner enforcement should run on executor-produced code/artifacts before accepting verifier success. High/critical scanner findings should block or force operator review; low/medium findings can be reported as diagnostics.
- **D-14:** Input validation hardening should use existing Zod contracts and route-local parse helpers. Do not add a new validation framework.
- **D-15:** Security scanning must remain local and deterministic. Do not add SaaS scanners or network-dependent tools in this phase.

### Engineering Gates
- **D-16:** Add an explicit TypeScript typecheck gate if feasible, because the repo currently has test/build scripts but no root typecheck script.
- **D-17:** Keep `pnpm` as the package manager truth. Mixed npm lock artifacts should not be expanded; plans may remove or document `package-lock.json` only if that is explicitly scoped.
- **D-18:** Verification should include focused regression tests for changed backend routes/services plus the existing high-value `pnpm test` and `pnpm build` commands where practical.

### Agent's Discretion
- Exact thresholds for local performance tests may be chosen by the planner based on stable CI/runtime behavior.
- The planner may choose whether metrics store wiring, query consolidation, and security-scan enforcement are separate plans or grouped by dependency.
- If full `pnpm test` is too slow or environmental, focused Vitest slices are acceptable when documented with the reason and follow-up.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 6 goal, requirements PSC-01/PSC-03/PSC-04, success criteria, and boundary to later security/plugin ecosystem work.
- `.planning/REQUIREMENTS.md` — PSC requirement IDs and active/deferred security/performance requirements.
- `.planning/PROJECT.md` — Project boundary: local single-tenant AI coding governance MVP, not a general-purpose workflow platform.

### Architecture and Debt Maps
- `.planning/codebase/STACK.md` — pnpm workspace stack, Node/TypeScript/Fastify/Vitest/Vite commands, and current lack of root typecheck/lint scripts.
- `.planning/codebase/ARCHITECTURE.md` — Control-plane/execution-plane boundaries, event-sourced projection model, metrics/registry wiring notes.
- `.planning/codebase/CONCERNS.md` — High-priority findings for metrics route store wiring, security scanner enforcement, process-local runtime state, large concentration files, and missing gates.
- `.planning/codebase/TESTING.md` — Current test topology and high-value regression commands.
- `.planning/codebase/INTEGRATIONS.md` — Internal integration boundaries, optional Postgres behavior, and default route registrations.

### Prior Phase Decisions
- `.planning/phases/04-analytics-platform/04-CONTEXT.md` — Analytics decisions around pull-mode polling, SSE stream, audit trail, and alert rules.
- `.planning/phases/04-analytics-platform/04-VERIFICATION.md` — Verified analytics scope and the non-blocking Vite chunk-size warning.
- `.planning/phases/05-plugin-architecture/05-CONTEXT.md` — Local trusted plugin boundary and fail-closed validation style.
- `.planning/phases/05-plugin-architecture/05-VERIFICATION.md` — Verified plugin lifecycle and manual reload scope.

### Code Integration Points
- `apps/control-plane/src/server.ts` — Default route registration; currently registers `registerMetricsRoutes(app)` without a store.
- `apps/control-plane/src/routes/metrics.ts` — Metrics route behavior, unavailable default, token placeholder, and task/run aggregate calculation.
- `apps/control-plane/src/services/analytics-service.ts` — Analytics polling and snapshot cache behavior.
- `apps/control-plane/src/persistence/task-read-model.ts` — Persisted task projection queries, replay, runs, artifacts, operator actions, and rebuild behavior.
- `apps/acp-gateway/src/persistence/run-read-model.ts` — Persisted run projection behavior and ACP gateway query patterns.
- `apps/control-plane/src/security/code-scanner.ts` — Existing code security scanner and `shouldBlockExecution` helper.
- `apps/control-plane/src/security/sensitive-info-detector.ts` — Existing prompt/content sensitive information detector and redaction helper.
- `apps/control-plane/src/services/orchestrator-flows.ts` — Execution/verification flow where scanner enforcement can be inserted.
- `apps/control-plane/src/routes/tasks.ts` — Zod-validated task routes and route helper style.
- `apps/control-plane/src/routes/replay.ts` — Replay/runs/artifacts route surface that can expose query fan-out.
- `package.json` — Root scripts and package manager truth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scanCodeSecurity` and `shouldBlockExecution`: ready local scanner primitives for executor output enforcement.
- `scanForSensitiveInfo` and `redactSensitiveInfo`: ready local prompt/content scanner primitives.
- `AnalyticsService`: already caches the latest snapshot after polling and can inform metrics cache decisions.
- `TaskStore` and `OrchestratorService`: existing app-scoped dependency surfaces that can be passed into metrics route wiring.
- `createTaskReadModel` and `createRunReadModel`: projection-level optimization points with existing pg-mem tests.

### Established Patterns
- Fastify route modules accept injected dependencies for test isolation.
- Zod contracts and route-local `safeParse` helpers are the validation norm.
- Event-sourced read models rebuild from `event_log` and checkpoint projection state.
- In-memory first is acceptable for local MVP features when interfaces preserve a persistence path.
- Prior phases favor explicit lifecycle states and fail-closed validation over implicit side effects.

### Integration Points
- Metrics hardening connects `createControlPlaneApp()` to `registerMetricsRoutes(app, { store/service })`.
- Query optimization connects route tests to projection/read-model tests, especially task list, replay, task runs, artifacts, and recovery summaries.
- Security scanning connects `orchestrator-flows.ts` execution output handling to existing scanner utilities and tests.
- Typecheck gate connects root `package.json`, workspace TypeScript config, and CI-style verification commands.

</code_context>

<specifics>
## Specific Ideas

- Phase 6 should close concrete map findings instead of inventing a generic performance platform.
- Useful first wins are likely: default `/metrics` not unavailable, scanner enforcement wired into execution, and read-model query consolidation around replay/runs/artifacts.
- Keep every optimization observable through tests or command output; avoid "performance" commits that only move code.

</specifics>

<deferred>
## Deferred Ideas

- Redis or distributed caching topology.
- External/SaaS security scanning, dependency auditing services, or supply-chain policy engines.
- Multi-tenant security and public authentication/authorization.
- Distributed ACP registry persistence beyond the existing local process runtime.
- Frontend bundle splitting unless it is promoted as a dedicated web performance plan.

</deferred>

---

*Phase: 06-performance-optimization*
*Context gathered: 2026-05-02*
