import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  PluginManifestSchema,
  type PluginDiagnostic
} from "@feudal/contracts";
import type { PluginRegistrationInput } from "./plugin-store";

export interface PluginDiscoveryFailure {
  pluginId?: string;
  manifestPath?: string;
  diagnostic: PluginDiagnostic;
}

export interface PluginDiscoveryResult {
  discovered: PluginRegistrationInput[];
  failed: PluginDiscoveryFailure[];
}

function diagnostic(
  code: string,
  message: string,
  severity: PluginDiagnostic["severity"],
  details?: unknown
): PluginDiagnostic {
  return {
    code,
    message,
    severity,
    details
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isUnsafeEntryModule(entryModule: string): boolean {
  return (
    path.isAbsolute(entryModule) ||
    entryModule.split(/[\\/]/).includes("..")
  );
}

export class PluginDiscovery {
  private readonly roots: string[];

  constructor(options: { roots: string[] }) {
    this.roots = options.roots;
  }

  async discover(): Promise<PluginDiscoveryResult> {
    const discovered: PluginRegistrationInput[] = [];
    const failed: PluginDiscoveryFailure[] = [];
    const seenIds = new Set<string>();

    for (const root of this.roots) {
      const pluginDirs = await this.findPluginDirectories(root, failed);
      for (const pluginDir of pluginDirs) {
        const registration = await this.readPluginDirectory(pluginDir, seenIds);
        if ("failure" in registration) {
          failed.push(registration.failure);
        } else {
          discovered.push(registration.discovered);
        }
      }
    }

    return { discovered, failed };
  }

  private async findPluginDirectories(
    root: string,
    failed: PluginDiscoveryFailure[]
  ): Promise<string[]> {
    const rootManifest = path.join(root, "plugin.json");
    if (await exists(rootManifest)) {
      return [root];
    }

    let children;
    try {
      children = await readdir(root, { withFileTypes: true });
    } catch {
      failed.push({
        manifestPath: rootManifest,
        diagnostic: diagnostic(
          "PLUGIN_ROOT_NOT_FOUND",
          `Plugin root "${root}" could not be read`,
          "warning",
          { root }
        )
      });
      return [];
    }

    const pluginDirs: string[] = [];
    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }
      const childDir = path.join(root, child.name);
      if (await exists(path.join(childDir, "plugin.json"))) {
        pluginDirs.push(childDir);
      }
    }

    return pluginDirs;
  }

  private async readPluginDirectory(
    pluginDir: string,
    seenIds: Set<string>
  ): Promise<
    | { discovered: PluginRegistrationInput }
    | { failure: PluginDiscoveryFailure }
  > {
    const manifestPath = path.join(pluginDir, "plugin.json");
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      return {
        failure: {
          manifestPath,
          diagnostic: diagnostic(
            "PLUGIN_MANIFEST_JSON_INVALID",
            `Plugin manifest "${manifestPath}" is not valid JSON`,
            "error",
            { error: error instanceof Error ? error.message : String(error) }
          )
        }
      };
    }

    const parsed = PluginManifestSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        failure: {
          manifestPath,
          diagnostic: diagnostic(
            "PLUGIN_MANIFEST_INVALID",
            `Plugin manifest "${manifestPath}" failed validation`,
            "error",
            { issues: parsed.error.issues }
          )
        }
      };
    }

    const manifest = parsed.data;
    if (seenIds.has(manifest.id)) {
      return {
        failure: {
          pluginId: manifest.id,
          manifestPath,
          diagnostic: diagnostic(
            "PLUGIN_DUPLICATE_ID",
            `Duplicate plugin id "${manifest.id}" discovered`,
            "error",
            { pluginId: manifest.id }
          )
        }
      };
    }
    seenIds.add(manifest.id);

    if (isUnsafeEntryModule(manifest.entry.module)) {
      return {
        failure: {
          pluginId: manifest.id,
          manifestPath,
          diagnostic: diagnostic(
            "PLUGIN_ENTRY_UNSAFE",
            `Plugin "${manifest.id}" entry module is unsafe`,
            "error",
            { entryModule: manifest.entry.module }
          )
        }
      };
    }

    const entryPath = path.join(pluginDir, manifest.entry.module);
    if (!(await exists(entryPath))) {
      return {
        failure: {
          pluginId: manifest.id,
          manifestPath,
          diagnostic: diagnostic(
            "PLUGIN_ENTRY_NOT_FOUND",
            `Plugin "${manifest.id}" entry module was not found`,
            "error",
            { entryPath }
          )
        }
      };
    }

    return {
      discovered: {
        manifest,
        source: {
          kind: "local-directory",
          rootPath: pluginDir,
          manifestPath
        }
      }
    };
  }
}

