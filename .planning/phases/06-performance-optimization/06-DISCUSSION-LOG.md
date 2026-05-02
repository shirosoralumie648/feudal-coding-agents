# Phase 6: Performance Optimization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 06-performance-optimization
**Areas discussed:** Performance scope, Query/projection optimization, Metrics wiring, Security enforcement, Engineering gates

---

## Performance Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted hardening | Optimize known hot paths and mapped concerns in the existing local MVP | ✓ |
| Broad rewrite | Restructure large backend systems before measuring | |
| External infrastructure | Add Redis/queues/distributed cache as the first move | |

**User's choice:** Inferred from zero-argument `$gsd-next` and existing roadmap boundary.  
**Notes:** The selected direction keeps Phase 6 inside PSC-01/PSC-03/PSC-04 without adding new product surfaces.

---

## Query and Projection Optimization

| Option | Description | Selected |
|--------|-------------|----------|
| Projection-level consolidation | Reduce repeated persisted reads while preserving event-sourced rebuild correctness | ✓ |
| Response caching first | Cache route responses even if projection fan-out remains | |
| Cosmetic file split | Split large files without a measurable behavior or testability gain | |

**User's choice:** Inferred from codebase concerns and Phase 6 requirements.  
**Notes:** N+1 work should focus on `task-read-model.ts`, replay/runs/artifacts queries, and route patterns that fan out from one user action.

---

## Metrics Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Wire existing store | Pass the app-scoped task store/service into metrics routes | ✓ |
| Leave placeholder | Keep `/metrics` unavailable in the default app | |
| Build new observability service | Create a new service layer before fixing current wiring | |

**User's choice:** Inferred from `.planning/codebase/CONCERNS.md`.  
**Notes:** This is a concrete PSC-01 improvement and should be verifiable with default app route tests.

---

## Security Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Local fail-closed scanner | Use existing code/sensitive-info scanners on execution outputs and block high/critical findings | ✓ |
| Advisory-only scanner | Keep scanner utilities tested but not on the execution path | |
| External scanning | Add network-dependent security scanning service | |

**User's choice:** Inferred from PSC-04 and existing local scanner code.  
**Notes:** Enforcement should be deterministic and local. Low/medium findings can remain diagnostics; high/critical findings should block or require operator review.

---

## Engineering Gates

| Option | Description | Selected |
|--------|-------------|----------|
| Add explicit typecheck | Add a root TypeScript-only check if feasible and keep pnpm as package manager truth | ✓ |
| Rely on tests/build only | Continue without a typecheck gate | |
| Add multiple format/lint tools now | Introduce broad style tooling during performance/security work | |

**User's choice:** Inferred from codebase testing map and missing-gate concern.  
**Notes:** A focused typecheck gate fits Phase 6; lint/format policy can wait unless a plan scopes it clearly.

---

## the agent's Discretion

- Exact local performance thresholds for route/projection checks.
- Whether metrics wiring, projection optimization, scanner enforcement, and typecheck gate are separate plans or dependency-grouped plans.
- Whether full workspace tests are feasible in verification or should be supplemented with focused slices and documented environment limits.

## Deferred Ideas

- Redis/distributed cache.
- External security scanning services.
- Multi-tenant auth/security model.
- Distributed runtime registry persistence.
- Frontend bundle splitting unless explicitly promoted during planning.
