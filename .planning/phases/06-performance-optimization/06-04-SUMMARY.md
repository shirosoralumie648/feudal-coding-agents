---
phase: 06-performance-optimization
plan: 04
subsystem: typecheck
tags: [typescript, typecheck, pnpm, verification, vitest]
requires:
  - phase: 06-performance-optimization
    provides: Prior Phase 6 implementation waves
provides:
  - Root pnpm typecheck script
  - Dedicated tsconfig.typecheck.json
  - Local pg module declarations for persistence typechecking
  - Source strictness fixes needed for a green typecheck baseline
  - Gateway Vitest alias correction for workspace subpath imports
affects: [repo-tooling, acp-gateway, control-plane, persistence, web]
tech-stack:
  added: []
  patterns: [source-typecheck-gate, pnpm-only-verification]
key-files:
  created:
    - tsconfig.typecheck.json
    - packages/persistence/src/pg.d.ts
  modified:
    - package.json
    - packages/persistence/src/event-store.ts
    - apps/acp-gateway/src/agent-registry/discovery.ts
    - apps/acp-gateway/src/persistence/run-read-model.ts
    - apps/acp-gateway/src/routes/runs.ts
    - apps/acp-gateway/vitest.config.ts
    - apps/control-plane/src/config.ts
    - apps/control-plane/src/governance/auto-approval.ts
    - apps/control-plane/src/governance/rbac-middleware.ts
    - apps/control-plane/src/governance/rbac-policy.ts
    - apps/control-plane/src/persistence/task-read-model.ts
    - apps/control-plane/src/routes/tasks.ts
    - apps/control-plane/src/services/orchestrator-flows.ts
    - apps/control-plane/src/services/workflow-template-engine.ts
    - apps/web/src/components/audit-trail-viewer.tsx
    - apps/web/src/hooks/use-task-console.ts
key-decisions:
  - "The Phase 6 gate is a source typecheck gate; Vitest remains the test fixture type/behavior gate."
  - "Tests and e2e files are excluded from tsconfig.typecheck.json to keep the compiler gate focused on shipped source."
  - "pnpm remains the only package-manager path; package-lock.json was not updated."
patterns-established:
  - "Workspace source imports need explicit gateway Vitest aliases for @feudal/acp subpaths."
requirements-completed: [PSC-01, PSC-04]
duration: 35 min
completed: 2026-05-04
---

# Phase 06 Plan 04: Typecheck Gate Summary

**The repo now has an explicit green TypeScript source gate.**

## Performance

- **Started:** 2026-05-04T13:05:00+08:00
- **Completed:** 2026-05-04T13:30:00+08:00
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added `tsconfig.typecheck.json` extending the base config with `noEmit`, `react-jsx`, Node types, source includes, and generated/worktree/test excludes.
- Added root `pnpm typecheck` script using `tsc -p tsconfig.typecheck.json --noEmit --pretty false`.
- Fixed source strictness issues surfaced by the new gate: union narrowing, ACPMessage typing, lazy store signatures, RBAC request context typing, workflow condition object guards, React state defaults, and persisted event-store return typing.
- Added local `pg` declarations for the persistence package because `@types/pg` is not installed.
- Corrected the ACP gateway Vitest alias paths and added subpath aliases so `@feudal/acp/http-client` resolves in smoke tests.

## Task Commits

1. **Task 1: Add runnable typecheck project config** - pending in Phase 6 closeout commit
2. **Task 2: Fix current typecheck baseline errors without behavioral rewrites** - pending in Phase 6 closeout commit
3. **Task 3: Add root typecheck script and final gate documentation** - pending in Phase 6 closeout commit

## Files Created/Modified

- `tsconfig.typecheck.json` - Root TypeScript source-check project.
- `package.json` - Added `typecheck` script.
- `packages/persistence/src/pg.d.ts` - Local pg module declarations.
- `packages/persistence/src/event-store.ts` - Explicit event record return types.
- `apps/acp-gateway/vitest.config.ts` - Correct workspace alias paths and ACP subpath aliases.
- `apps/acp-gateway/src/*` and `apps/control-plane/src/*` - Narrow type fixes without behavior rewrites.
- `apps/web/src/components/audit-trail-viewer.tsx` and `apps/web/src/hooks/use-task-console.ts` - React state/ref type fixes.

## Deviations from Plan

- `tsconfig.typecheck.json` excludes `**/*.test.ts`, `**/*.test.tsx`, and `**/e2e/**`. This keeps the new gate focused on shipped source while existing Vitest coverage continues to type-check and execute test fixtures through the test runner.
- The initially suggested `"vite/client"` type entry was not used because Vite types are app-local and not needed by the current source gate.
- A gateway Vitest alias fix was added because full-suite verification exposed a workspace subpath resolution failure in `src/smoke.test.ts`.

## Verification

- `COREPACK_HOME=/tmp/corepack corepack pnpm typecheck`
  - Result: passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks`
  - Result: 9 files, 68 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm --filter @feudal/acp-gateway exec vitest run --config vitest.config.ts src/smoke.test.ts --pool=forks`
  - Result: 1 file, 2 tests passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm test -- --pool=forks`
  - Result: 56 files, 543 tests passed.
- `COREPACK_HOME=/tmp/corepack corepack pnpm build`
  - Result: passed. Vite emitted the existing large chunk warning.

## User Setup Required

None.

## Next Phase Readiness

Ready for `$gsd-verify-work`. Phase 6 now has focused tests, full test suite coverage, build verification, and a root typecheck gate.
