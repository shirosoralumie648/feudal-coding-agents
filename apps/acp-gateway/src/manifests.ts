import type { ACPAgentManifest } from "@feudal/acp";

export const manifests: ACPAgentManifest[] = [
  {
    name: "intake-agent",
    role: "宰相府",
    description: "Normalizes user requests into task specifications.",
    capabilities: ["taskspec"]
  },
  {
    name: "analyst-agent",
    role: "中书省",
    description: "Produces decision briefs and planning artifacts.",
    capabilities: ["decision-brief"]
  },
  {
    name: "auditor-agent",
    role: "门下省",
    description: "Checks consistency and operational risk.",
    capabilities: ["review"]
  },
  {
    name: "critic-agent",
    role: "门下省",
    description: "Produces adversarial review feedback.",
    capabilities: ["review"]
  },
  {
    name: "gongbu-executor",
    role: "工部",
    description: "Executes approved assignments.",
    capabilities: ["assignment", "execution-report"]
  },
  {
    name: "xingbu-verifier",
    role: "刑部",
    description: "Verifies execution evidence.",
    capabilities: ["execution-report"]
  }
];
