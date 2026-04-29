---
phase: 03-workflow-templates
plan: 03
subsystem: workflow-templates
tags: [store, crud, optimistic-locking, event-sourcing, export-import]
requires: [03-01]
provides: [TemplateStore, MemoryTemplateStore]
affects: [workflow-template-store.ts]
tech-stack:
  added:
    - in-memory Map-based store pattern
  patterns:
    - optimistic-locking
    - event-sourcing
    - draft-published-lifecycle
    - monotonic-timestamps
key-files:
  created:
    - apps/control-plane/src/services/workflow-template-store.ts
    - apps/control-plane/src/services/workflow-template-store.test.ts
decisions:
  - Monotonic timestamp helper prevents same-millisecond overlap in createdAt/updatedAt checks
metrics:
  duration: "~10 minutes"
  completed: "2026-04-29T18:12:00Z"
---

# Phase 3 Plan 3: TemplateStore with event-sourced CRUD and optimistic locking

Persistent lifecycle management layer for workflow templates implementing D-13 (optimistic locking with draft/published status), D-14 (event-sourced version history + memory cache), and D-15 (JSON export/import for cross-project sharing). The `MemoryTemplateStore` implements the full `TemplateStore` interface with in-memory Maps for development, following the established `MemoryTaskStore` pattern.

## Task Summary

| # | Task | Type | Commit | Tests |
|---|------|------|--------|-------|
| 1 | TemplateStore CRUD + optimistic locking | auto (tdd) | `da74dc3` | 10/10 pass |
| 2 | Template export/import (D-15) | auto (tdd) | `b2c3b83` | 7/7 pass |

## Commits

| Hash | Message |
|------|---------|
| `6d64fc5` | test(03-03): add failing tests for TemplateStore CRUD and optimistic locking |
| `da74dc3` | feat(03-03): implement TemplateStore with event-sourced CRUD and optimistic locking |
| `69cb97e` | test(03-03): add failing tests for template export/import |
| `b2c3b83` | feat(03-03): implement template export/import for cross-project sharing |

## Interface Coverage

| Method | Implemented | Optimistic Lock | Threat Mitigation |
|--------|------------|-----------------|-------------------|
| `createTemplate` | Yes | N/A (creates at v1) | Duplicate name rejection |
| `getTemplate` | Yes | N/A | Returns undefined for missing |
| `updateTemplate` | Yes | expectedVersion check | Version mismatch error (T-03-14) |
| `publishTemplate` | Yes | expectedVersion check | Already-published guard |
| `unpublishTemplate` | Yes | expectedVersion check | Not-published guard |
| `deleteTemplate` | Yes | expectedVersion check | Published template protection |
| `listTemplates` | Yes | N/A | Status filter |
| `getTemplateVersionHistory` | Yes | N/A | Returns chronological events |
| `exportTemplate` | Yes | N/A | Draft protection (T-03-13), strips internal state (T-03-12) |
| `importTemplate` | Yes | N/A | Format validation (T-03-10), status reset to draft (T-03-11) |

## Design Decisions (D-13 through D-15)

- **D-13 (Optimistic Locking):** `checkVersion` private method used in update, publish, unpublish, and delete. Mismatched `expectedVersion` throws descriptive error with current vs. expected versions.
- **D-14 (Event Sourcing + Cache):** `TemplateVersionEvent` records (created/updated/published/unpublished/deleted) stored in `versionHistory` Map. `publishedCache` Map provides fast reads for published templates.
- **D-15 (Export/Import):** Export strips `status`, `eventVersion`, `lastPublishedVersion` from output. Import validates `feudal-template/v1` format, resets status to "draft", rejects name collisions.

## Threat Model Compliance

All five mitigations from the plan's STRIDE register are implemented:

| Threat | Mitigation | Location |
|--------|-----------|----------|
| T-03-10 (Spoofing - format) | `pkg.format === "feudal-template/v1"` check | `importTemplate` |
| T-03-11 (Tampering - status injection) | Status reset to "draft" regardless of input | `importTemplate` |
| T-03-12 (Tampering - state leakage) | Destructure to strip status/ev/lpv | `exportTemplate` |
| T-03-13 (Info Disclosure - draft) | Reject non-published templates | `exportTemplate` |
| T-03-14 (Tampering - concurrent writes) | `checkVersion` guard | `updateTemplate`, `publishTemplate`, etc. |

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

| Gate | Task 1 | Task 2 |
|------|--------|--------|
| RED | `6d64fc5` (10 failing) | `69cb97e` (7 failing + 10 passing) |
| GREEN | `da74dc3` (10 passing) | `b2c3b83` (17 passing) |

Both tasks follow strict RED-GREEN cycle.

## Self-Check

- [x] `apps/control-plane/src/services/workflow-template-store.ts` exists (281 lines)
- [x] `apps/control-plane/src/services/workflow-template-store.test.ts` exists (328 lines)
- [x] All 4 commits verified in git log
- [x] All 17 tests pass (verified at 18:11:56)
- [x] All grep-based acceptance criteria met (10/10 checks)
- [x] No stub patterns, no TODOs, no placeholders in production code
- [x] No new threat surface beyond what's documented in threat model
