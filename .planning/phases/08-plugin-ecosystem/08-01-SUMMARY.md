---
phase: 08-plugin-ecosystem
plan: 01
subsystem: plugin-contracts-sdk
tags: [plugins, sdk, zod, compatibility, security]
requires:
  - phase: 05-plugin-architecture
    provides: Plugin manifest contracts and lifecycle records
provides:
  - Plugin permission contracts
  - Plugin compatibility review contracts
  - Plugin security review contracts
  - Plugin marketplace entry contracts
  - SDK helper functions for extensions, permissions, and compatibility
affects: [contracts, plugin-ecosystem]
tech-stack:
  added: []
  patterns: [zod-contract, backwards-compatible-defaults, local-sdk-helper]
key-files:
  modified:
    - packages/contracts/src/plugins/types.ts
    - packages/contracts/src/plugins/sdk.ts
    - packages/contracts/src/plugins/types.test.ts
key-decisions:
  - "Existing manifests parse with default trusted-local security and empty permissions."
  - "Compatibility is evaluated locally from manifest version bounds and current app version."
  - "SDK helpers remain type-safe manifest builders, not runtime plugin loaders."
patterns-established:
  - "Plugin ecosystem APIs share security, compatibility, and marketplace schemas from @feudal/contracts."
requirements-completed: [PLG-03, PSC-02]
completed: 2026-05-04
---

# Phase 08 Plan 01: Plugin Contracts and SDK Summary

**Plugin manifests now carry ecosystem metadata for permissions, compatibility, security review, and local marketplace display.**

## Accomplishments

- Added manifest-level `security.permissions` with backwards-compatible defaults.
- Added shared compatibility, security review, risk, and marketplace entry schemas.
- Added SDK helpers for ACP worker extensions, workflow step providers, permission declarations, and compatibility checks.
- Preserved Phase 5 manifest behavior while giving Phase 8 routes and UI one contract surface to consume.

## Files Created/Modified

- `packages/contracts/src/plugins/types.ts` - Ecosystem schemas and types.
- `packages/contracts/src/plugins/sdk.ts` - SDK helper functions.
- `packages/contracts/src/plugins/types.test.ts` - Contract and SDK coverage.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts apps/control-plane/src/services/plugin-security-policy.test.ts apps/control-plane/src/routes/plugins.test.ts apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx --pool=forks`
  - Result: passed, including Plan 01 contract coverage.

## Next Phase Readiness

Ready for security policy, marketplace routes, and UI consumption.
