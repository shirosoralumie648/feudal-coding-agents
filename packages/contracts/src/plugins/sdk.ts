import {
  AcpWorkerExtensionSchema,
  PluginCompatibilityReviewSchema,
  PluginManifestSchema,
  PluginPermissionSchema,
  WorkflowStepProviderExtensionSchema,
  type AcpWorkerExtension,
  type PluginCompatibilityReview,
  type PluginManifest,
  type PluginPermission,
  type WorkflowStepProviderExtension
} from "./types";
import type { z } from "zod";

export function definePluginManifest(
  manifest: z.input<typeof PluginManifestSchema>
): PluginManifest {
  return PluginManifestSchema.parse(manifest);
}

export function validatePluginManifest(input: unknown) {
  return PluginManifestSchema.safeParse(input);
}

export function defineAcpWorkerExtension(
  extension: z.input<typeof AcpWorkerExtensionSchema>
): AcpWorkerExtension {
  return AcpWorkerExtensionSchema.parse(extension);
}

export function defineWorkflowStepProviderExtension(
  extension: z.input<typeof WorkflowStepProviderExtensionSchema>
): WorkflowStepProviderExtension {
  return WorkflowStepProviderExtensionSchema.parse(extension);
}

export function definePluginPermission(
  permission: z.input<typeof PluginPermissionSchema>
): PluginPermission {
  return PluginPermissionSchema.parse(permission);
}

function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function evaluatePluginCompatibility(
  manifest: PluginManifest,
  options: { appVersion?: string } = {}
): PluginCompatibilityReview {
  const parsed = PluginManifestSchema.parse(manifest);
  const currentVersion = options.appVersion;
  const { minVersion, maxVersion } = parsed.compatibility;

  if (!currentVersion) {
    return PluginCompatibilityReviewSchema.parse({
      status: minVersion || maxVersion ? "unknown" : "compatible",
      app: parsed.compatibility.app,
      minVersion,
      maxVersion,
      reason: minVersion || maxVersion
        ? "Current app version is unknown"
        : "Manifest targets this app"
    });
  }

  if (minVersion && compareVersions(currentVersion, minVersion) < 0) {
    return PluginCompatibilityReviewSchema.parse({
      status: "incompatible",
      app: parsed.compatibility.app,
      currentVersion,
      minVersion,
      maxVersion,
      reason: `Current app version ${currentVersion} requires at least ${minVersion}`
    });
  }

  if (maxVersion && compareVersions(currentVersion, maxVersion) > 0) {
    return PluginCompatibilityReviewSchema.parse({
      status: "incompatible",
      app: parsed.compatibility.app,
      currentVersion,
      minVersion,
      maxVersion,
      reason: `Current app version ${currentVersion} exceeds maximum ${maxVersion}`
    });
  }

  return PluginCompatibilityReviewSchema.parse({
    status: "compatible",
    app: parsed.compatibility.app,
    currentVersion,
    minVersion,
    maxVersion,
    reason: "Manifest targets this app"
  });
}
