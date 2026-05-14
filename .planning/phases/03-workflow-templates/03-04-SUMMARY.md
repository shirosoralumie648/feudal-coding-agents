---
phase: 03-workflow-templates
plan: 04
subsystem: api
tags: [fastify, zod, workflow-templates, template-api, rest]

# Dependency graph
requires:
  - phase: 03-02
    provides: WorkflowTemplateEngine with executeTemplate, resolveExecutionOrder, evaluateCondition, DEFAULT_TEMPLATE
  - phase: 03-03
    provides: TemplateStore interface, MemoryTemplateStore with full CRUD lifecycle, export/import, version history
  - phase: 03-01
    provides: WorkflowTemplate types, Zod schemas, TemplateInstantiation, TemplateExportPackage
provides:
  - Template REST API with 10 endpoints (CRUD, publish/unpublish, export, version history, instantiation)
  - Zod-validated request handling with proper HTTP error codes (400, 404, 409)
  - Optimistic locking via if-match header on all mutating endpoints
  - Template instantiation creating tasks via orchestrator service
  - defaultTemplateStore (MemoryTemplateStore) and defaultTemplateEngine singletons in config.ts
  - Template routes registered in server.ts createControlPlaneApp
affects: [04-analytics-platform, 05-plugin-architecture, api-integration, task-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fastify route registration pattern: registerXxxRoutes(app, options?) with injectable store/engine dependencies"
    - "Zod schema composition: WorkflowTemplateSchema.shape.parameters reused in route input schemas"
    - "Optimistic locking: if-match header parsed as integer eventVersion, enforced at route level before store delegation"
    - "Error classification: handleStoreError maps store error messages to HTTP status codes"
    - "Lazy singleton pattern in config.ts: exported const singletons for store and engine"

key-files:
  created:
    - apps/control-plane/src/routes/templates.ts
    - apps/control-plane/src/routes/templates.test.ts
  modified:
    - apps/control-plane/src/config.ts
    - apps/control-plane/src/server.ts

key-decisions:
  - "Template instantiation creates tasks via OrchestratorService.createTask() with title/prompt from bound parameters"
  - "if-match header required for all mutating operations (PUT, publish, unpublish, DELETE) — blanket D-13 enforcement"
  - "Error classification uses message substring matching (already exists, Version mismatch, etc.) consistent with existing Fastify route patterns"
  - "Draft templates cannot be instantiated — returns 400 with descriptive error per threat mitigation T-03-17"

patterns-established:
  - "Route registration: registerTemplateRoutes(app, { store?, engine? }) with defaults from config.ts"
  - "Request validation: parseOrReply pattern for Zod safeParse with early 400 returns"
  - "Optimistic locking: parseIfMatch / requireIfMatch helpers deduplicate if-match logic across routes"

requirements-completed: [WFT-01, WFT-02]

# Metrics
duration: 10min
completed: 2026-04-29
---

# Phase 3 Plan 4: Template API Integration Summary

**10-endpoint REST API for workflow template CRUD, publish/unpublish lifecycle, export, version history, and task instantiation — wired as Fastify routes with Zod validation, optimistic locking, and orchestrator integration**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-29T10:18:00Z
- **Completed:** 2026-04-29T10:27:57Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 10 REST endpoints covering full template lifecycle: create, list, get, update, publish, unpublish, delete, export, version history, and instantiation
- Zod schema validation for all request bodies and URL params with descriptive 400 error messages
- if-match header optimistic locking enforced on all mutating operations (PUT, publish, unpublish, DELETE) — D-13 compliance
- Template instantiation validates published status then creates tasks via OrchestratorService (D-12 integration)
- Config singletons (defaultTemplateStore, defaultTemplateEngine) wired following existing lazy-singleton pattern
- Server route registration integrated into createControlPlaneApp between task routes and operator action routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create template CRUD, export, and instantiation API routes** - `b195430` (feat)
2. **Task 2: Wire template services into config.ts and register routes in server.ts** - `f75a9db` (feat)

## Files Created/Modified
- `apps/control-plane/src/routes/templates.ts` - 10 template API endpoints with Zod validation, if-match enforcement, and error handling (308 lines)
- `apps/control-plane/src/routes/templates.test.ts` - 16 integration tests using Fastify.inject + MemoryTemplateStore
- `apps/control-plane/src/config.ts` - Added defaultTemplateStore and defaultTemplateEngine singleton exports
- `apps/control-plane/src/server.ts` - Added registerTemplateRoutes call in createControlPlaneApp

## Decisions Made
- Inline error classification uses message substring matching ("already exists", "Version mismatch", etc.) — follows the existing pattern from operator-actions.ts rather than introducing a typed error hierarchy
- Instantiation creates tasks by building a TaskSpec from template bound parameters (title, prompt from params) and delegating to defaultOrchestratorService — keeps the route stateless and avoids engine coupling
- exportTemplate validation runs TemplateExportPackageSchema.parse before returning — defense-in-depth against malformed store output
- Unpublished template tests included to verify full state transition (published → draft) in addition to draft → published

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 16 tests passed on first run, all 438 tests pass across the full test suite, grep acceptance criteria met on first attempt.

## Threat Mitigations Verified

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-03-15 | PUT rejects requests without if-match with 400 | Verified |
| T-03-16 | Version mismatch returns 409 Conflict | Verified |
| T-03-17 | Draft template instantiation blocked with 400 | Verified |

## Next Phase Readiness
- All template types (Phase 03-01), engine (03-02), store (03-03), and API (03-04) are complete
- Template system is fully integrated and testable via REST API
- Phase 4 (Analytics Platform) can consume template data via GET /api/templates endpoints
- Phase 5 (Plugin Architecture) can extend template instantiation via the orchestrator service

---
*Phase: 03-workflow-templates*
*Completed: 2026-04-29*
