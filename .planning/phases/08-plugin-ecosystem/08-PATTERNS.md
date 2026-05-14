# Phase 8: Plugin Ecosystem - Patterns

**Mapped:** 2026-05-04

## Existing Patterns to Follow

- **Zod contracts first:** shared shapes belong in `packages/contracts/src/plugins/*` and are re-exported through the existing plugin index.
- **Backwards-compatible defaults:** existing plugin manifests should parse after adding optional fields with defaults.
- **Injected Fastify routes:** route modules accept service/store/discovery options for isolated tests.
- **In-memory local MVP:** lifecycle/catalog/security state can derive from existing store and discovery without adding persistence.
- **Fail closed:** invalid manifests, failed plugins, unsafe entries, and high-risk enablement without approval should be blocked.
- **Web data through API helpers:** React components call `apps/web/src/lib/api.ts`, not backend services.
- **Dense operator UI:** console panels use compact metrics and tables rather than landing pages or marketing cards.

## Closest Code Analogs

| New Work | Existing Analog |
|----------|-----------------|
| Plugin security policy | `apps/control-plane/src/security/execution-scanner.ts`, `apps/control-plane/src/governance/rbac-policy.ts` |
| Marketplace/catalog service | `PluginExtensionCatalog`, `MemoryPluginStore.listEnabledExtensions()` |
| Plugin routes | `apps/control-plane/src/routes/plugins.ts` |
| SDK helpers | `packages/contracts/src/plugins/sdk.ts` |
| Web panel | `AnalyticsDashboard`, `AgentRegistryPanel`, `AuditTrailViewer` |

## Avoided Patterns

- Remote registry clients.
- Runtime module import or plugin code execution.
- Filesystem watchers.
- Broad UI redesign.
- Auth claims beyond explicit local approval payloads.
