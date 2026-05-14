import type { ACPAgentManifest } from "@feudal/acp";

export const manifests: ACPAgentManifest[] = [
  {
    name: "intake-agent",
    role: "宰相府",
    displayName: "Intake",
    narrativeAlias: "宰相府",
    capabilityGroup: "intake",
    required: true,
    enabledByDefault: true,
    description: "Runtime intake agent for normalizing user requests into task specifications.",
    capabilities: ["taskspec"]
  },
  {
    name: "analyst-agent",
    role: "中书省",
    displayName: "Analyst",
    narrativeAlias: "中书省",
    capabilityGroup: "planning",
    required: true,
    enabledByDefault: true,
    description: "Runtime planning agent for producing decision briefs and planning artifacts.",
    capabilities: ["decision-brief"]
  },
  {
    name: "fact-checker-agent",
    role: "采风司",
    displayName: "Fact Checker",
    narrativeAlias: "采风司",
    capabilityGroup: "analysis",
    required: false,
    enabledByDefault: false,
    description: "Runtime reference-checking agent for non-blocking evidence validation before review.",
    capabilities: ["fact-check"]
  },
  {
    name: "auditor-agent",
    role: "门下省",
    displayName: "Auditor",
    narrativeAlias: "门下省",
    capabilityGroup: "review",
    required: true,
    enabledByDefault: true,
    description: "Runtime review agent for consistency and operational risk checks.",
    capabilities: ["review"]
  },
  {
    name: "critic-agent",
    role: "门下省",
    displayName: "Critic",
    narrativeAlias: "门下省",
    capabilityGroup: "review",
    required: true,
    enabledByDefault: true,
    description: "Runtime review agent for adversarial feedback.",
    capabilities: ["review"]
  },
  {
    name: "gongbu-executor",
    role: "工部",
    displayName: "Executor",
    narrativeAlias: "工部",
    capabilityGroup: "execution",
    required: true,
    enabledByDefault: true,
    description: "Runtime execution agent for approved assignments.",
    capabilities: ["assignment", "execution-report"]
  },
  {
    name: "xingbu-verifier",
    role: "刑部",
    displayName: "Verifier",
    narrativeAlias: "刑部",
    capabilityGroup: "verification",
    required: true,
    enabledByDefault: true,
    description: "Runtime verification agent for execution evidence.",
    capabilities: ["execution-report"]
  }
];
