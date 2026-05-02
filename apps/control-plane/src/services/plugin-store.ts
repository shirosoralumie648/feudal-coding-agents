import {
  PluginManifestSchema,
  type AcpWorkerExtension,
  type EnabledPluginExtensions,
  type PluginDiagnostic,
  type PluginLifecycleState,
  type PluginManifest,
  type PluginRecord,
  type PluginSource,
  type WorkflowStepProviderExtension
} from "@feudal/contracts";

export interface PluginRegistrationInput {
  manifest: PluginManifest;
  source: PluginSource;
  diagnostics?: PluginDiagnostic[];
}

export interface ListPluginsFilter {
  state?: PluginLifecycleState;
}

export interface PluginLifecycleEvent {
  eventType:
    | "plugin.discovered"
    | "plugin.registered"
    | "plugin.enabled"
    | "plugin.disabled"
    | "plugin.failed"
    | "plugin.reloaded";
  pluginId: string;
  state: PluginLifecycleState;
  occurredAt: string;
  diagnostic?: PluginDiagnostic;
}

export interface PluginStore {
  registerDiscovered(input: PluginRegistrationInput): Promise<PluginRecord>;
  getPlugin(pluginId: string): Promise<PluginRecord | undefined>;
  listPlugins(filter?: ListPluginsFilter): Promise<PluginRecord[]>;
  enablePlugin(pluginId: string): Promise<PluginRecord>;
  disablePlugin(pluginId: string): Promise<PluginRecord>;
  reloadPlugin(pluginId: string, manifest: PluginManifest): Promise<PluginRecord>;
  markPluginFailed(
    pluginId: string,
    diagnostic: PluginDiagnostic
  ): Promise<PluginRecord>;
  getPluginLifecycleHistory(pluginId: string): Promise<PluginLifecycleEvent[]>;
  listEnabledExtensions(): Promise<EnabledPluginExtensions>;
}

function isAcpWorkerExtension(
  extension: PluginManifest["extensionPoints"][number]
): extension is AcpWorkerExtension {
  return extension.type === "acp-worker";
}

function isWorkflowStepProviderExtension(
  extension: PluginManifest["extensionPoints"][number]
): extension is WorkflowStepProviderExtension {
  return extension.type === "workflow-step-provider";
}

function extractManifestFromDiagnostic(
  diagnostic: PluginDiagnostic
): PluginManifest | undefined {
  const details = diagnostic.details;
  const direct = PluginManifestSchema.safeParse(details);
  if (direct.success) {
    return direct.data;
  }

  if (!details || typeof details !== "object" || !("manifest" in details)) {
    return undefined;
  }

  const nested = PluginManifestSchema.safeParse(
    (details as { manifest: unknown }).manifest
  );
  return nested.success ? nested.data : undefined;
}

export class MemoryPluginStore implements PluginStore {
  private readonly plugins = new Map<string, PluginRecord>();
  private readonly history = new Map<string, PluginLifecycleEvent[]>();
  private lastTimestamp = new Date(0);

  private now(): string {
    const current = new Date();
    if (current <= this.lastTimestamp) {
      this.lastTimestamp = new Date(this.lastTimestamp.getTime() + 1);
      return this.lastTimestamp.toISOString();
    }
    this.lastTimestamp = current;
    return current.toISOString();
  }

  private recordEvent(
    eventType: PluginLifecycleEvent["eventType"],
    pluginId: string,
    state: PluginLifecycleState,
    diagnostic?: PluginDiagnostic
  ): void {
    const event: PluginLifecycleEvent = {
      eventType,
      pluginId,
      state,
      occurredAt: this.now(),
      diagnostic
    };
    const existing = this.history.get(pluginId) ?? [];
    this.history.set(pluginId, [...existing, event]);
  }

  private requirePlugin(pluginId: string): PluginRecord {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }
    return record;
  }

  async registerDiscovered(
    input: PluginRegistrationInput
  ): Promise<PluginRecord> {
    const manifest = PluginManifestSchema.parse(input.manifest);
    const existing = this.plugins.get(manifest.id);
    if (existing) {
      throw new Error(`Plugin "${manifest.id}" already exists`);
    }

    const now = this.now();
    const state: PluginLifecycleState = manifest.enabledByDefault
      ? "enabled"
      : "registered";
    const record: PluginRecord = {
      manifest,
      state,
      source: input.source,
      diagnostics: input.diagnostics ?? [],
      createdAt: now,
      updatedAt: now,
      enabledAt: state === "enabled" ? now : undefined
    };

    this.plugins.set(manifest.id, record);
    this.recordEvent(
      state === "enabled" ? "plugin.enabled" : "plugin.registered",
      manifest.id,
      state
    );
    return record;
  }

  async getPlugin(pluginId: string): Promise<PluginRecord | undefined> {
    return this.plugins.get(pluginId);
  }

  async listPlugins(filter?: ListPluginsFilter): Promise<PluginRecord[]> {
    const records = [...this.plugins.values()];
    if (!filter?.state) {
      return records;
    }
    return records.filter((record) => record.state === filter.state);
  }

  async enablePlugin(pluginId: string): Promise<PluginRecord> {
    const existing = this.requirePlugin(pluginId);
    if (existing.state === "failed") {
      throw new Error(`Cannot enable failed plugin "${pluginId}"`);
    }

    const now = this.now();
    const updated: PluginRecord = {
      ...existing,
      state: "enabled",
      updatedAt: now,
      enabledAt: now,
      disabledAt: undefined
    };
    this.plugins.set(pluginId, updated);
    this.recordEvent("plugin.enabled", pluginId, "enabled");
    return updated;
  }

  async disablePlugin(pluginId: string): Promise<PluginRecord> {
    const existing = this.requirePlugin(pluginId);
    const now = this.now();
    const updated: PluginRecord = {
      ...existing,
      state: "disabled",
      updatedAt: now,
      disabledAt: now
    };
    this.plugins.set(pluginId, updated);
    this.recordEvent("plugin.disabled", pluginId, "disabled");
    return updated;
  }

  async reloadPlugin(
    pluginId: string,
    manifest: PluginManifest
  ): Promise<PluginRecord> {
    const existing = this.requirePlugin(pluginId);
    const parsed = PluginManifestSchema.parse(manifest);
    if (parsed.id !== pluginId) {
      throw new Error(
        `Plugin reload id mismatch: expected "${pluginId}", received "${parsed.id}"`
      );
    }

    const now = this.now();
    const state: PluginLifecycleState =
      existing.state === "failed" ? "registered" : existing.state;
    const updated: PluginRecord = {
      ...existing,
      manifest: parsed,
      state,
      updatedAt: now,
      lastReloadedAt: now
    };
    this.plugins.set(pluginId, updated);
    this.recordEvent("plugin.reloaded", pluginId, state);
    return updated;
  }

  async markPluginFailed(
    pluginId: string,
    diagnostic: PluginDiagnostic
  ): Promise<PluginRecord> {
    const existing = this.plugins.get(pluginId);
    const manifest = existing?.manifest ?? extractManifestFromDiagnostic(diagnostic);
    if (!manifest) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    const parsed = PluginManifestSchema.parse(manifest);
    const now = this.now();
    const record: PluginRecord = {
      manifest: parsed,
      state: "failed",
      source: existing?.source ?? { kind: "inline" },
      diagnostics: [...(existing?.diagnostics ?? []), diagnostic],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      enabledAt: existing?.enabledAt,
      disabledAt: existing?.disabledAt,
      lastReloadedAt: existing?.lastReloadedAt
    };

    this.plugins.set(pluginId, record);
    this.recordEvent("plugin.failed", pluginId, "failed", diagnostic);
    return record;
  }

  async getPluginLifecycleHistory(
    pluginId: string
  ): Promise<PluginLifecycleEvent[]> {
    return this.history.get(pluginId) ?? [];
  }

  async listEnabledExtensions(): Promise<EnabledPluginExtensions> {
    const enabled = [...this.plugins.values()].filter(
      (record) => record.state === "enabled"
    );

    return {
      acpWorkers: enabled.flatMap((record) =>
        record.manifest.extensionPoints.filter(isAcpWorkerExtension)
      ),
      workflowStepProviders: enabled.flatMap((record) =>
        record.manifest.extensionPoints.filter(isWorkflowStepProviderExtension)
      )
    };
  }
}

