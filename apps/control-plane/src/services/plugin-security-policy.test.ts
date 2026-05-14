import { describe, expect, it } from "vitest";
import type { PluginManifest } from "@feudal/contracts";
import { PluginSecurityPolicy } from "./plugin-security-policy";

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: overrides.id ?? "local.safe-plugin",
    name: overrides.name ?? "Local Safe Plugin",
    version: overrides.version ?? "1.0.0",
    capabilities: overrides.capabilities ?? ["agent-registration"],
    extensionPoints:
      overrides.extensionPoints ??
      [
        {
          type: "acp-worker",
          id: "local.safe-plugin.worker",
          workerName: "safe-worker",
          displayName: "Safe Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json",
          outputSchema: {},
          required: false,
          enabledByDefault: false
        }
      ],
    entry: overrides.entry ?? { module: "dist/index.js" },
    enabledByDefault: overrides.enabledByDefault ?? false,
    compatibility: overrides.compatibility ?? {
      app: "feudal-coding-agents"
    },
    metadata: overrides.metadata ?? {},
    security: overrides.security ?? {
      permissions: []
    }
  };
}

describe("PluginSecurityPolicy", () => {
  it("treats plugins without permissions as low risk", () => {
    const review = new PluginSecurityPolicy().reviewManifest(makeManifest());

    expect(review.riskLevel).toBe("low");
    expect(review.approvalRequired).toBe(false);
    expect(review.findings).toEqual([]);
  });

  it("requires approval for high-risk process and secret permissions", () => {
    const review = new PluginSecurityPolicy().reviewManifest(
      makeManifest({
        id: "local.high-risk-plugin",
        security: {
          permissions: [
            {
              type: "process",
              access: "execute",
              target: "codex",
              justification: "Run a local worker"
            },
            {
              type: "secrets",
              access: "read",
              target: "OPENAI_API_KEY",
              justification: "Use provider credentials"
            }
          ]
        }
      })
    );

    expect(review.riskLevel).toBe("high");
    expect(review.approvalRequired).toBe(true);
    expect(review.findings.map((finding) => finding.code)).toEqual([
      "PLUGIN_PERMISSION_PROCESS",
      "PLUGIN_PERMISSION_SECRETS"
    ]);
  });

  it("reports incompatible app version bounds", () => {
    const policy = new PluginSecurityPolicy({ appVersion: "1.0.0" });
    const compatibility = policy.evaluateCompatibility(
      makeManifest({
        compatibility: {
          app: "feudal-coding-agents",
          minVersion: "2.0.0"
        }
      })
    );

    expect(compatibility.status).toBe("incompatible");
    expect(compatibility.reason).toContain("requires at least 2.0.0");
  });
});
