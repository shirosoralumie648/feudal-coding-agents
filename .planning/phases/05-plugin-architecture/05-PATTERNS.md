---
phase: 05-plugin-architecture
status: complete
created: 2026-05-02
---

# Phase 05 Pattern Map: Plugin Architecture

## Files and Closest Analogs

| Planned file | Role | Closest analog | Pattern to reuse |
|--------------|------|----------------|------------------|
| `packages/contracts/src/plugins/types.ts` | Shared plugin schemas and types | `packages/contracts/src/analytics/types.ts` | Zod-first schemas, exported inferred types, small interface surface |
| `packages/contracts/src/plugins/index.ts` | Plugin contract barrel | `packages/contracts/src/analytics/index.ts` | Re-export focused contract module from root `index.ts` |
| `packages/contracts/src/plugins/types.test.ts` | Contract tests | `packages/contracts/src/analytics/types.test.ts` | Parse representative payloads and reject invalid variants |
| `apps/control-plane/src/services/plugin-store.ts` | Plugin registry and lifecycle store | `apps/control-plane/src/services/workflow-template-store.ts` | Interface plus in-memory implementation, event history, state transition methods |
| `apps/control-plane/src/services/plugin-discovery.ts` | Local manifest scanner | `apps/acp-gateway/src/agent-registry/discovery.ts` and `apps/acp-gateway/src/agent-registry/registry.ts` | Explicit validation, duplicate handling, deterministic result objects |
| `apps/control-plane/src/routes/plugins.ts` | Lifecycle API | `apps/control-plane/src/routes/templates.ts` | `registerXRoutes(app, options?)`, injected dependencies, `safeParse`, deterministic error codes |
| `apps/control-plane/src/config.ts` | Default plugin singletons | Existing `defaultTemplateStore` / `defaultTemplateEngine` | Export default store/discovery and parse env config outside routes |
| `apps/control-plane/src/server.ts` | Route registration | Existing route registration block | Add `registerPluginRoutes(app, { store, discovery })` near template routes |
| `apps/acp-gateway/src/plugins/plugin-manifest-adapter.ts` | Gateway consumption adapter | `apps/acp-gateway/src/agent-registry/seed.ts` | Convert plugin extension points into `AgentRegistrationInput` records |
| `apps/acp-gateway/src/plugins/index.ts` | Gateway plugin barrel | `apps/acp-gateway/src/agent-registry/index.ts` | Re-export adapter helpers only |

## Concrete Code Patterns

### Route Module Pattern

Use the templates route style:

```typescript
export function registerTemplateRoutes(
  app: FastifyInstance,
  options?: {
    store?: TemplateStore;
    engine?: WorkflowTemplateEngine;
  }
) {
  const store = options?.store ?? defaultTemplateStore;
  app.post("/api/templates", async (request, reply) => {
    const payload = parseOrReply(CreateTemplateInput, request.body, reply);
    if (!payload) return reply;
    // ...
  });
}
```

Plugin routes should follow the same dependency injection shape:

```typescript
export function registerPluginRoutes(
  app: FastifyInstance,
  options?: {
    store?: PluginStore;
    discovery?: PluginDiscovery;
  }
)
```

### Store Pattern

Use the template store shape:

```typescript
export interface TemplateStore {
  createTemplate(...): Promise<WorkflowTemplate>;
  listTemplates(filter?: ListTemplatesFilter): Promise<WorkflowTemplate[]>;
}

export class MemoryTemplateStore implements TemplateStore {
  private readonly templates = new Map<string, WorkflowTemplate>();
  private readonly versionHistory = new Map<string, TemplateVersionEvent[]>();
}
```

Plugin store should mirror this with:

- `registerPlugin(manifest, source)`
- `getPlugin(pluginId)`
- `listPlugins(filter?)`
- `enablePlugin(pluginId)`
- `disablePlugin(pluginId)`
- `markPluginFailed(pluginId, diagnostic)`
- `getPluginLifecycleHistory(pluginId)`
- `listEnabledExtensions()`

### Gateway Adapter Pattern

Use `acpManifestToRegistryManifest` as the adapter template:

```typescript
export function acpManifestToRegistryManifest(acp: ACPAgentManifest): AgentRegistrationInput {
  return {
    agentId: acp.name,
    capabilities: acp.capabilities,
    status: "online",
    metadata: {
      displayName: acp.displayName,
      role: acp.role,
      required: acp.required ?? false,
      enabledByDefault: acp.enabledByDefault ?? false
    },
    isTemporary: false
  };
}
```

Plugin adapter should produce the same `AgentRegistrationInput` type for enabled `acp-worker` extension points, with metadata fields for `pluginId`, `pluginVersion`, and `extensionPoint: "acp-worker"`.

## Data Flow

1. Operator calls `POST /api/plugins/discover` or `POST /api/plugins/reload`.
2. `PluginDiscovery` scans configured roots for `plugin.json`.
3. Each manifest is validated through `PluginManifestSchema`.
4. `PluginStore` records valid plugins as `discovered` or `registered`; invalid ones become `failed` diagnostics.
5. Operator enables a registered plugin through `POST /api/plugins/:pluginId/enable`.
6. `GET /api/plugins/extensions/enabled` exposes enabled extension declarations.
7. ACP gateway adapter consumes enabled `acp-worker` extension declarations and turns them into registry registration inputs.
8. Workflow template code can consume enabled `workflow-step-provider` declarations as an extension catalog.

## Verification Pattern

Use targeted Vitest slices rather than watch mode:

`COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm exec vitest run --config vitest.config.ts packages/contracts/src/plugins/types.test.ts packages/contracts/src/index.test.ts apps/control-plane/src/services/plugin-store.test.ts apps/control-plane/src/services/plugin-discovery.test.ts apps/control-plane/src/routes/plugins.test.ts apps/acp-gateway/src/plugins/plugin-manifest-adapter.test.ts --pool=forks`

