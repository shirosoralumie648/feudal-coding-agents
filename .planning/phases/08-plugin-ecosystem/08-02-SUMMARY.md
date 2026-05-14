---
phase: 08-plugin-ecosystem
plan: 02
subsystem: plugin-marketplace-security
tags: [plugins, security, fastify, marketplace]
requires:
  - phase: 08-plugin-ecosystem
    plan: 01
    provides: Plugin security and marketplace contracts
provides:
  - PluginSecurityPolicy
  - PluginMarketplace local catalog service
  - /api/plugins/marketplace route
  - /api/plugins/:pluginId/security route
  - High-risk enablement approval gate
affects: [control-plane, plugin-routes, security]
tech-stack:
  added: []
  patterns: [fail-closed-enable, local-derived-catalog, route-injection]
key-files:
  created:
    - apps/control-plane/src/services/plugin-security-policy.ts
    - apps/control-plane/src/services/plugin-security-policy.test.ts
    - apps/control-plane/src/services/plugin-marketplace.ts
  modified:
    - apps/control-plane/src/routes/plugins.ts
    - apps/control-plane/src/routes/plugins.test.ts
    - apps/control-plane/src/config.ts
key-decisions:
  - "Marketplace means local discovered/installed plugin catalog, not remote install."
  - "Process, secrets, broad filesystem write, and workflow admin permissions require explicit admin approval."
  - "Default plugin discovery includes `plugins/examples` so example manifests are visible locally."
patterns-established:
  - "High-risk plugin enablement fails closed unless the route payload includes admin approval."
requirements-completed: [PLG-03, PSC-02]
completed: 2026-05-04
---

# Phase 08 Plan 02: Plugin Marketplace and Security Summary

**Control-plane plugin APIs now expose local catalog status and enforce high-risk plugin approval.**

## Accomplishments

- Added `PluginSecurityPolicy` to derive risk, findings, approval requirements, and compatibility.
- Added `PluginMarketplace` to combine installed store records and discovered local plugin manifests.
- Added `GET /api/plugins/marketplace` for local catalog snapshots.
- Added `GET /api/plugins/:pluginId/security` for security review.
- Hardened `POST /api/plugins/:pluginId/enable` so high-risk plugins require explicit admin approval.
- Updated default plugin roots to include `plugins/examples`.

## Files Created/Modified

- `apps/control-plane/src/services/plugin-security-policy.ts` - Security and compatibility review service.
- `apps/control-plane/src/services/plugin-security-policy.test.ts` - Risk and compatibility tests.
- `apps/control-plane/src/services/plugin-marketplace.ts` - Local catalog service.
- `apps/control-plane/src/routes/plugins.ts` - Marketplace, security, and enablement routes.
- `apps/control-plane/src/routes/plugins.test.ts` - Route-level coverage.
- `apps/control-plane/src/config.ts` - Default local plugin roots.

## Deviations from Plan

None.

## Verification

- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts apps/control-plane/src/services/plugin-security-policy.test.ts apps/control-plane/src/routes/plugins.test.ts apps/web/src/lib/api.test.ts apps/web/src/app.test.tsx --pool=forks`
  - Result: passed, including Plan 02 route and policy coverage.

## Next Phase Readiness

Ready for operator console display, SDK docs, and example plugin files.
