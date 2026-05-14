import {
  PluginMarketplaceEntrySchema,
  type PluginMarketplaceEntry,
  type PluginRecord
} from "@feudal/contracts";
import type { PluginDiscovery, PluginDiscoveryFailure } from "./plugin-discovery";
import type { PluginStore } from "./plugin-store";
import { PluginSecurityPolicy } from "./plugin-security-policy";

export interface PluginMarketplaceSnapshot {
  entries: PluginMarketplaceEntry[];
  failed: PluginDiscoveryFailure[];
}

function extensionTypes(record: Pick<PluginRecord, "manifest">): PluginMarketplaceEntry["extensionTypes"] {
  return [
    ...new Set(
      record.manifest.extensionPoints.map((extensionPoint) => extensionPoint.type)
    )
  ];
}

export class PluginMarketplace {
  constructor(
    private readonly options: {
      store: PluginStore;
      discovery: PluginDiscovery;
      securityPolicy?: PluginSecurityPolicy;
    }
  ) {}

  async listLocalCatalog(): Promise<PluginMarketplaceSnapshot> {
    const securityPolicy =
      this.options.securityPolicy ?? new PluginSecurityPolicy();
    const installed = await this.options.store.listPlugins();
    const discovery = await this.options.discovery.discover();
    const installedIds = new Set(installed.map((record) => record.manifest.id));
    const entries: PluginMarketplaceEntry[] = [];

    for (const record of installed) {
      entries.push(
        PluginMarketplaceEntrySchema.parse({
          pluginId: record.manifest.id,
          name: record.manifest.name,
          version: record.manifest.version,
          description: record.manifest.description,
          state: record.state,
          sourceKind: record.source.kind,
          extensionTypes: extensionTypes(record),
          compatibility: securityPolicy.evaluateCompatibility(record.manifest),
          security: securityPolicy.reviewManifest(record.manifest)
        })
      );
    }

    for (const item of discovery.discovered) {
      if (installedIds.has(item.manifest.id)) {
        continue;
      }

      entries.push(
        PluginMarketplaceEntrySchema.parse({
          pluginId: item.manifest.id,
          name: item.manifest.name,
          version: item.manifest.version,
          description: item.manifest.description,
          state: "available",
          sourceKind: item.source.kind,
          extensionTypes: extensionTypes({ manifest: item.manifest }),
          compatibility: securityPolicy.evaluateCompatibility(item.manifest),
          security: securityPolicy.reviewManifest(item.manifest)
        })
      );
    }

    entries.sort((left, right) => left.pluginId.localeCompare(right.pluginId));

    return {
      entries,
      failed: discovery.failed
    };
  }
}
