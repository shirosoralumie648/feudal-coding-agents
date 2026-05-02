---
phase: 06
slug: performance-optimization
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-02
---

# Phase 06 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest plus TypeScript compiler |
| Config file | `vitest.config.ts`, `tsconfig.typecheck.json` after Plan 06-04 |
| Quick run command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts --pool=forks` |
| Full suite command | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/security/code-scanner.test.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks` |
| Estimated runtime | ~60 seconds for focused suite, typecheck runtime to be measured in Plan 06-04 |

## Sampling Rate

- After every task commit: run the task-specific focused command.
- After every plan wave: run the full Phase 6 focused suite.
- Before `$gsd-verify-work`: full Phase 6 focused suite, `COREPACK_HOME=/tmp/corepack corepack pnpm typecheck`, `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm test -- --pool=forks` where practical, and `COREPACK_HOME=/tmp/corepack corepack pnpm build`.
- Max feedback latency: 90 seconds for focused task commands.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PSC-01 | T-06-01 | Default `/metrics` uses app-scoped store and no longer returns unavailable | route/unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/routes/metrics.test.ts apps/control-plane/src/services/metrics-service.test.ts --pool=forks` | W0 covered | pending |
| 06-01-02 | 01 | 1 | PSC-01 | T-06-02 | Local metrics cache avoids repeated store reads inside TTL | unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/services/metrics-service.test.ts --pool=forks` | W0 covered | pending |
| 06-02-01 | 02 | 1 | PSC-03 | T-06-04 | Audit event loading uses bulk persisted event path instead of per-task hydration | unit/integration | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/services/analytics-service.test.ts --pool=forks` | W0 covered | pending |
| 06-02-02 | 02 | 1 | PSC-03 | T-06-05 | Replay, runs, and artifacts preserve missing-task semantics and checkpoint behavior | route/integration | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/persistence/task-read-model.test.ts apps/control-plane/src/routes/replay.test.ts --pool=forks` | W0 covered | pending |
| 06-03-01 | 03 | 2 | PSC-04 | T-06-07 | High/critical executor findings block before verifier success | service/unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/security/execution-scanner.test.ts apps/control-plane/src/services/orchestrator-flows.test.ts --pool=forks` | W0 covered | pending |
| 06-03-02 | 03 | 2 | PSC-04 | T-06-08 | Sensitive information is redacted in diagnostics and high severity findings block | service/unit | `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts apps/control-plane/src/security/sensitive-info-detector.test.ts apps/control-plane/src/security/execution-scanner.test.ts --pool=forks` | W0 covered | pending |
| 06-04-01 | 04 | 3 | PSC-01 | T-06-10 | Root typecheck is explicit, green, and pnpm-only | compiler | `COREPACK_HOME=/tmp/corepack corepack pnpm typecheck` | W0 covered | pending |

## Wave 0 Requirements

Existing Vitest infrastructure covers all phase requirements. Plan 06-04 creates the TypeScript gate before it becomes mandatory for verify-work.

## Manual-Only Verifications

All phase behaviors have automated verification. The response time target is validated with bounded local fixture tests rather than manual timing.

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target is below 90 seconds for focused commands.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: approved 2026-05-02
