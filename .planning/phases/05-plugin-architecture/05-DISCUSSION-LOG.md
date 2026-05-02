# Phase 5: Plugin Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 05-plugin-architecture
**Areas discussed:** Plugin scope, registry ownership, hot reload and safety, API/developer surface

---

## Plugin Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Local trusted plugins | File/directory manifests reviewed in Git, local-only loading | ✓ |
| Remote marketplace plugins | Discover/install from remote registry | |
| Fully generic extension platform | Arbitrary route/UI/runtime injection | |

**User's choice:** Auto-selected fallback based on roadmap boundaries.
**Notes:** Phase 5 covers plugin architecture and lifecycle. Marketplace/API ecosystem work belongs to Phase 8, and general-purpose workflow-engine expansion remains out of scope.

---

## Registry Ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Control-plane registry truth | Control-plane owns lifecycle APIs and plugin state; gateway consumes enabled declarations | ✓ |
| ACP gateway registry truth | Gateway owns plugin lifecycle directly | |
| Split truth | Both services manage separate plugin registries | |

**User's choice:** Auto-selected fallback based on existing architecture.
**Notes:** `control-plane` is the business entry point. `acp-gateway` remains execution boundary and should not own business lifecycle truth.

---

## Hot Reload and Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Manual API reload | Operator triggers rescan/reload; no filesystem watcher dependency | ✓ |
| Automatic filesystem watch | Watch plugin directories and reload on change | |
| Remote dynamic installation | Install and load arbitrary plugin packages | |

**User's choice:** Auto-selected fallback based on local environment and safety.
**Notes:** The repo has already hit watcher limits (`ENOSPC`) during dev/test, so manual reload is more deterministic. Remote dynamic loading and sandboxing are deferred.

---

## API and Developer Surface

| Option | Description | Selected |
|--------|-------------|----------|
| API-first lifecycle | `/api/plugins/*` routes plus shared manifest contracts | ✓ |
| UI-first plugin manager | Build web management UI before backend contract is stable | |
| Public SDK first | Prioritize external developer packaging/docs | |

**User's choice:** Auto-selected fallback based on existing Fastify/Zod patterns.
**Notes:** Phase 5 should ship the architecture foundation. A small internal SDK/type surface is acceptable if needed; public SDK and marketplace docs are Phase 8.

---

## Agent's Discretion

- Exact route names and helper names may follow existing control-plane conventions.
- Planning may choose a manifest-only first slice before executable module loading if that keeps risk contained.
- Web UI is optional unless planning determines API-only lifecycle cannot satisfy acceptance.

## Deferred Ideas

- Public plugin marketplace.
- Remote plugin installation.
- Untrusted plugin sandboxing and permission policy.
- Generic frontend plugin slots.
- General-purpose workflow engine behavior.
