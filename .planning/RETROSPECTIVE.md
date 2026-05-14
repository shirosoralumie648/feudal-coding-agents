# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 - MVP

**Shipped:** 2026-05-14
**Phases:** 8 | **Plans:** 27 | **Tasks:** 44

### What Was Built

- Governance rules, RBAC, role routes, complexity scoring, and auto-approval.
- ACP gateway messaging, registry, discovery, heartbeat, failover, and scheduling.
- Code-first workflow templates with version history, export/import, REST APIs, and orchestration integration.
- Analytics snapshots, SSE streams, alerting, audit trail UI, and web console panels.
- Plugin lifecycle, extension catalog, gateway adapter, local marketplace, security review, SDK docs, and an example plugin.
- Metrics caching, read-model fan-out reduction, execution artifact scanning, and root typecheck gate.

### What Worked

- Keeping contracts in `packages/contracts` made backend, gateway, and web changes easier to verify together.
- Local deterministic services were enough for the MVP and avoided unnecessary Redis, queue, SaaS scanner, or remote marketplace complexity.
- Focused Vitest slices followed by root `typecheck`, full `test`, and `build` gave a reliable closeout gate.

### What Was Inefficient

- Several early phases shipped before the Nyquist `*-VALIDATION.md` convention existed, leaving artifact debt at milestone audit time.
- Large files remain active pressure points: `task-read-model.ts`, `orchestrator-flows.ts`, and `use-task-console.ts`.
- The release boundary had to be established after milestone archive generation because the verified code initially lived only in the working tree.

### Patterns Established

- Use local trusted catalogs for plugin ecosystem work until a future milestone explicitly designs remote install and sandboxing.
- Keep scheduler state process-local for this MVP; distributed durability should be a conscious later milestone.
- Prefer source-level typecheck as an explicit gate while Vitest owns test fixtures and behavior.

### Key Lessons

1. Archive and audit workflows need an explicit source-boundary check before tag creation.
2. Requirements tables drift unless phase verification updates them or milestone closeout records the roadmap-scoped interpretation.
3. Validation artifacts should be created during each phase, not retrofitted at milestone close.

### Cost Observations

- Model mix: not measured in repo artifacts.
- Sessions: multiple GSD sessions across initialization, phase execution, verification, and map refresh.
- Notable: direct file-backed fallback remained necessary when agent or SDK surfaces were incomplete.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multiple | 8 | Moved from prototype state to verified local MVP with governance, ACP, analytics, scheduler, and plugin ecosystem surfaces. |

### Cumulative Quality

| Milestone | Tests | Coverage | Notable Gate |
|-----------|-------|----------|--------------|
| v1.0 | 571 passing Vitest tests | Not measured | Root `pnpm typecheck`, full `pnpm test`, `pnpm build`, and `git diff --check`. |

### Top Lessons

1. Release tagging must wait until the tested working tree is represented by a commit.
2. Local-first boundaries should be written explicitly so future phases do not overclaim distributed or marketplace semantics.
