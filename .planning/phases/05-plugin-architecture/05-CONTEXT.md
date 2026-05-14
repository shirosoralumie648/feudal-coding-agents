# Phase 5: Plugin Architecture - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the local plugin architecture foundation for Feudal Coding Agents: plugin contracts, local manifest discovery, registration, enable/disable lifecycle, lifecycle APIs, and clear integration seams for worker/agent and workflow-template extensions. This phase makes the app plugin-capable, but it does not build a public marketplace, remote package installation, untrusted sandboxing, or a full UI extension platform.

</domain>

<decisions>
## Implementation Decisions

### Plugin Scope and Shape
- **D-01:** Treat Phase 5 as a local-first trusted plugin architecture, not a plugin marketplace. Plugins are discovered from repo/local filesystem metadata, not installed from remote registries.
- **D-02:** Define a canonical plugin manifest with Zod validation in shared contracts. Required fields should include plugin id, name, version, capabilities, extension points, entry module path, enabled-by-default flag, and compatibility metadata.
- **D-03:** Supported extension points for this phase should be narrow and explicit: ACP worker/agent contributions and workflow-template step/provider contributions. Generic UI extensions, arbitrary route injection, and marketplace metadata are deferred.
- **D-04:** Plugin packages should be file/directory based (`plugin.json` plus optional local module entry). This keeps export/import, Git review, and single-user local deployment consistent with the existing template-sharing direction.

### Registry and Lifecycle Ownership
- **D-05:** Control-plane owns plugin registry truth and lifecycle API because it is the business entry point and already owns templates, tasks, governance, and operator APIs.
- **D-06:** ACP gateway consumes enabled worker/agent plugin declarations through explicit manifests or an injected registry adapter; it must not become the business source of truth for plugin lifecycle.
- **D-07:** Lifecycle states should be explicit and observable: `discovered`, `registered`, `enabled`, `disabled`, and `failed`. Enable/disable should be operator-controlled and reversible.
- **D-08:** Use an injectable `PluginStore` / `MemoryPluginStore` pattern first, mirroring `TemplateStore`, with a future path to event persistence. Do not require Postgres for the first plugin architecture slice.

### Hot Reload and Safety
- **D-09:** Hot reload means manual rescan/reload through API, not automatic filesystem watchers. The repo already hits local watcher limits (`ENOSPC`) during dev, and explicit reload is more deterministic.
- **D-10:** Plugin module loading is trusted local execution only in Phase 5. Avoid remote code execution, dependency installation, or sandbox claims until a later security/plugin ecosystem phase.
- **D-11:** Plugin enablement should fail closed: invalid manifests, incompatible versions, duplicate ids, missing entry files, or failed module imports leave the plugin disabled/failed with a diagnostic.
- **D-12:** Plugin capabilities must be declared and validated before use. A plugin cannot silently affect task lifecycle unless its extension point is known and enabled.

### API and Developer Surface
- **D-13:** Add Fastify routes under `/api/plugins/*` for list, inspect, register/discover, enable, disable, reload, and lifecycle status. Follow the existing `registerXRoutes(app, options?)` injectable dependency pattern.
- **D-14:** Provide a small internal developer SDK/package surface only if needed for type safety: manifest types, helper validators, lifecycle hook interfaces, and test fixtures. Public SDK docs and marketplace-grade packaging are Phase 8 work.
- **D-15:** Plugin lifecycle changes should produce audit-friendly events or version history where practical, following the template lifecycle pattern.

### Agent's Discretion
- Exact route names, helper names, and file layout may follow existing control-plane conventions.
- The first implementation may keep module loading shallow if plans determine manifest-only lifecycle is the safer initial slice.
- Web UI for plugins is optional for Phase 5 unless planning finds it necessary for acceptance; API-level lifecycle is the core.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 5 goal, requirements PLG-01/PLG-02, success criteria, and Phase 8 boundary.
- `.planning/REQUIREMENTS.md` — PLG requirement IDs and active/deferred plugin requirements.
- `.planning/PROJECT.md` — Project boundary: not a general-purpose workflow engine; plugin system is active but marketplace-style expansion is out of scope for this phase.

### Prior Phase Decisions
- `.planning/phases/03-workflow-templates/03-CONTEXT.md` — Template architecture decisions, code-first JSON sharing, optimistic lifecycle, and deferred marketplace ideas.
- `.planning/phases/03-workflow-templates/03-04-SUMMARY.md` — Route/store/engine patterns that Phase 5 should extend.
- `.planning/phases/02-multi-agent-foundation/02-CONTEXT.md` — Agent registry/discovery/health decisions and ACP gateway extension direction.

### Architecture and Status
- `.planning/codebase/ARCHITECTURE.md` — Current boundary model: web, control-plane, ACP gateway, contracts, orchestrator, ACP, persistence.
- `.planning/codebase/STACK.md` — TypeScript/Fastify/Zod/Vitest/pnpm stack and test/build command shape.
- `CURRENT_STATUS.md` — Clarifies that the current product is not yet a plugin platform, and that existing role extension is manifest-based and local.
- `docs/ARCHITECTURE.md` — Runtime agent manifest truth and optional fact-checker extension slot.
- `docs/TERMINOLOGY.md` — Terminology constraints: workflow states are not institutions; plugin work should preserve canonical vocabulary.

### Code Integration Points
- `apps/control-plane/src/routes/templates.ts` — Fastify route pattern with injectable store/engine, Zod validation, and optimistic concurrency.
- `apps/control-plane/src/services/workflow-template-store.ts` — Store interface + in-memory implementation + lifecycle history pattern.
- `apps/control-plane/src/services/workflow-template-types.ts` — Zod/domain type pattern for extension-style definitions.
- `apps/control-plane/src/config.ts` — Default singleton wiring pattern used by templates.
- `apps/control-plane/src/server.ts` — Route registration and service lifecycle integration.
- `apps/acp-gateway/src/agent-registry/types.ts` — Agent registration metadata/capability schema pattern.
- `apps/acp-gateway/src/agent-registry/registry.ts` — Dynamic local registry, lifecycle events, restore, and change callbacks.
- `apps/acp-gateway/src/workers/types.ts` — Current worker definition and manifest-backed worker naming.
- `apps/acp-gateway/src/manifests.ts` — Current runtime agent manifest truth and optional extension slot.
- `packages/contracts/src/index.ts` — Shared schema export style and central type boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkflowTemplateStore` and `MemoryTemplateStore`: good model for plugin registry/store and lifecycle event history.
- `registerTemplateRoutes(app, { store?, engine? })`: established route dependency injection pattern for testable APIs.
- `AgentRegistry`: useful lifecycle model for dynamic registration, persistent vs temporary entries, change callbacks, and event restoration.
- `packages/contracts`: correct home for plugin manifest schemas/types if control-plane, web, and gateway all need them.
- `apps/control-plane/src/config.ts`: existing place for default singleton services.

### Established Patterns
- Zod validates public API payloads and shared domain contracts.
- Fastify route modules are registered from app entry points and tested with injected dependencies.
- In-memory store first is acceptable when there is a clear interface and a future persistence path.
- Capabilities should be explicit string lists, as seen in agent registry and manifests.
- The system prefers explicit state machines/lifecycle states over implicit side effects.

### Integration Points
- Control-plane plugin routes should expose operator-facing lifecycle management.
- ACP gateway should receive only enabled, validated worker/agent plugin declarations.
- Workflow template engine can consume enabled plugin-provided step/provider definitions.
- Web can later consume `/api/plugins/*` for a plugin management panel, but planning should keep UI optional unless required by acceptance.

</code_context>

<specifics>
## Specific Ideas

- Plugin architecture should deepen the existing manifest/registry extension model instead of reviving the broad historical "三省六部" role expansion.
- Manual reload is preferred over file watching because the local environment has already hit watcher limits during dev/test.
- Plugin definitions should be reviewable in Git and testable through local API calls.

</specifics>

<deferred>
## Deferred Ideas

- Public plugin marketplace and remote plugin discovery: Phase 8.
- Marketplace-grade plugin SDK, examples, publishing workflow, and compatibility catalog: Phase 8.
- Untrusted plugin sandboxing, dependency isolation, permissions policy, and supply-chain scanning: security/performance follow-up unless explicitly promoted.
- Generic web UI extension slots and arbitrary frontend component injection: future UI/plugin ecosystem work.
- General-purpose workflow engine behavior: remains out of scope per project boundary.

</deferred>

---

*Phase: 05-plugin-architecture*
*Context gathered: 2026-05-02*
