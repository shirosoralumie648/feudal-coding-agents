---
phase: 08
slug: plugin-ecosystem
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
---

# Phase 08 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest plus TypeScript compiler and Vite build |
| Config file | `vitest.config.ts`, `tsconfig.typecheck.json` |
| Quick run command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts apps/control-plane/src/routes/plugins.test.ts apps/control-plane/src/services/plugin-security-policy.test.ts apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx --pool=forks` |
| Full suite command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm test -- --pool=forks` |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | PLG-03, PSC-02 | T-08-01 | Plugin manifests declare permissions and compatibility without breaking Phase 5 manifests | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts --pool=forks` | W0 covered | passed 2026-05-04 |
| 08-01-02 | 01 | 1 | PLG-03 | T-08-02 | SDK helpers create extension declarations, permission requests, and compatibility reviews | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts --pool=forks` | W0 covered | passed 2026-05-04 |
| 08-02-01 | 02 | 1 | PSC-02 | T-08-03 | High-risk plugin enablement fails closed without explicit admin approval | route/unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/plugin-security-policy.test.ts apps/control-plane/src/routes/plugins.test.ts --pool=forks` | W0 covered | passed 2026-05-04 |
| 08-02-02 | 02 | 1 | PLG-03 | T-08-04 | Marketplace endpoint reports discovered/installed plugins with lifecycle, compatibility, and security status | route | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/plugins.test.ts --pool=forks` | W0 covered | passed 2026-05-04 |
| 08-03-01 | 03 | 2 | PLG-03, PSC-02 | T-08-05 | Operator console shows plugin catalog, risk, compatibility, extensions, and SDK/example pointers | UI | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx --pool=forks` | W0 covered | passed 2026-05-04 |

## Manual-Only Verifications

All Phase 8 behaviors have automated verification. Example plugin files are covered indirectly by discovery-compatible manifest shape and docs review.

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-04 via file-based GSD fallback

## Verification Execution

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts apps/control-plane/src/services/plugin-security-policy.test.ts apps/control-plane/src/routes/plugins.test.ts apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx --pool=forks`
  - Result: passed, 5 test files and 63 tests.
- `COREPACK_HOME=/tmp/corepack corepack pnpm typecheck`
  - Result: passed.
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm test -- --pool=forks`
  - Result: passed, 60 test files and 566 tests.
- `COREPACK_HOME=/tmp/corepack corepack pnpm build`
  - Result: passed. Vite emitted the existing chunk-size warning.
