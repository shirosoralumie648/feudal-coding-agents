import {
  evaluatePluginCompatibility,
  PluginManifestSchema,
  PluginSecurityReviewSchema,
  type PluginCompatibilityReview,
  type PluginDiagnostic,
  type PluginManifest,
  type PluginPermission,
  type PluginRiskLevel,
  type PluginSecurityReview
} from "@feudal/contracts";

const riskRank: Record<PluginRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

function maxRisk(left: PluginRiskLevel, right: PluginRiskLevel): PluginRiskLevel {
  return riskRank[left] >= riskRank[right] ? left : right;
}

function riskForPermission(permission: PluginPermission): PluginRiskLevel {
  if (permission.type === "process" || permission.type === "secrets") {
    return "high";
  }

  if (permission.type === "filesystem" && permission.access !== "read") {
    return "high";
  }

  if (permission.type === "network" && permission.access === "connect") {
    return "medium";
  }

  if (permission.type === "workflow" && permission.access === "admin") {
    return "high";
  }

  return permission.type === "filesystem" ? "medium" : "low";
}

function diagnosticForPermission(
  permission: PluginPermission,
  riskLevel: PluginRiskLevel
): PluginDiagnostic {
  const code = `PLUGIN_PERMISSION_${permission.type.toUpperCase()}`;
  return {
    code,
    message: `${permission.type} ${permission.access} permission on ${permission.target} requires review`,
    severity: riskRank[riskLevel] >= riskRank.high ? "error" : "warning",
    details: permission
  };
}

export class PluginSecurityPolicy {
  constructor(
    private readonly options: {
      appVersion?: string;
      now?: () => string;
    } = {}
  ) {}

  evaluateCompatibility(manifest: PluginManifest): PluginCompatibilityReview {
    return evaluatePluginCompatibility(manifest, {
      appVersion: this.options.appVersion ?? "1.0.0"
    });
  }

  reviewManifest(manifest: PluginManifest): PluginSecurityReview {
    const parsed = PluginManifestSchema.parse(manifest);
    const findings: PluginDiagnostic[] = [];
    let riskLevel: PluginRiskLevel = "low";

    for (const permission of parsed.security.permissions) {
      const permissionRisk = riskForPermission(permission);
      riskLevel = maxRisk(riskLevel, permissionRisk);
      if (permissionRisk !== "low") {
        findings.push(diagnosticForPermission(permission, permissionRisk));
      }
    }

    const recommendations =
      riskRank[riskLevel] >= riskRank.high
        ? ["Admin approval required before enabling this plugin"]
        : findings.length > 0
          ? ["Review declared permissions before enabling this plugin"]
          : [];

    return PluginSecurityReviewSchema.parse({
      pluginId: parsed.id,
      riskLevel,
      approvalRequired: riskRank[riskLevel] >= riskRank.high,
      permissions: parsed.security.permissions,
      findings,
      recommendations,
      reviewedAt: this.options.now?.() ?? new Date().toISOString()
    });
  }
}
