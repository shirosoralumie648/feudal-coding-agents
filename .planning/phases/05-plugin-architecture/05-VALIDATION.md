---
phase: 05
slug: plugin-architecture
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-02
---

# Phase 05 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts apps/control-plane/src/services/plugin-store.test.ts --pool=forks` |
| Full suite command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/plugin-store.test.ts apps/control-plane/src/services/plugin-discovery.test.ts apps/control-plane/src/routes/plugins.test.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks` |
| Estimated runtime | ~20 seconds |

## Sampling Rate

- After every task commit: run the quick command or the task-specific focused command.
- After every plan wave: run the full suite command.
- Before `$gsd-verify-work`: full suite must be green.
- Max feedback latency: 60 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PLG-01 | T-05-01 | Invalid extension point types are rejected by Zod | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts --pool=forks` | W0 covered | pending |
| 05-01-02 | 01 | 1 | PLG-02 | T-05-02 | Invalid lifecycle transitions fail closed | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-store.test.ts --pool=forks` | W0 covered | pending |
| 05-01-03 | 01 | 1 | PLG-01 | T-05-03 | Unsafe entry paths and duplicate ids produce failed diagnostics | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-discovery.test.ts --pool=forks` | W0 covered | pending |
| 05-02-01 | 02 | 2 | PLG-02 | T-05-04 | Lifecycle routes validate input and return deterministic error codes | route | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/plugins.test.ts --pool=forks` | W0 covered | pending |
| 05-02-02 | 02 | 2 | PLG-01 | T-05-05 | Gateway only consumes enabled `acp-worker` declarations | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks` | W0 covered | pending |

## Wave 0 Requirements

Existing Vitest infrastructure covers all phase requirements.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references.
- [x] No watch-mode flags.
- [x] Feedback latency target is below 60 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-02

