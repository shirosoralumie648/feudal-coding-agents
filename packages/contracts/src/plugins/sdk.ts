import { PluginManifestSchema, type PluginManifest } from "./types";

export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return PluginManifestSchema.parse(manifest);
}

export function validatePluginManifest(input: unknown) {
  return PluginManifestSchema.safeParse(input);
}

