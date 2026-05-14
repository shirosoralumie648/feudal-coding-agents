import type { AgentMetadata, AgentStatus, DiscoveryQuery, DiscoveryResult } from "./types";
import type { AgentRegistry } from "./registry";

type WatchCallback = (agents: AgentMetadata[]) => void;

function matchesCapability(agent: AgentMetadata, capability: string): boolean {
  return agent.capabilities.includes(capability);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function matchesMetadata(
  agentMetadata: Record<string, unknown>,
  queryMetadata: Record<string, unknown>
): boolean {
  return Object.entries(queryMetadata).every(([key, value]) => {
    const candidate = agentMetadata[key];
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof candidate === "object" &&
      candidate !== null &&
      !Array.isArray(candidate)
    ) {
      return matchesMetadata(
        candidate as Record<string, unknown>,
        value as Record<string, unknown>
      );
    }

    return Object.is(candidate, value);
  });
}

export class AgentDiscoveryService {
  private readonly watchers = new Map<WatchCallback, DiscoveryQuery>();

  constructor(private readonly registry: AgentRegistry) {
    this.registry.onChange(() => {
      this.notifyWatchers();
    });
  }

  findByCapability(capability: string): AgentMetadata[] {
    return this.registry
      .listAgents()
      .filter((agent) => matchesCapability(agent, capability));
  }

  findByCapabilityPattern(pattern: string | RegExp): AgentMetadata[] {
    const regex = typeof pattern === "string" ? globToRegex(pattern) : pattern;
    return this.registry.listAgents().filter((agent) =>
      agent.capabilities.some((capability) => regex.test(capability))
    );
  }

  findByStatus(status: AgentStatus | AgentStatus[]): AgentMetadata[] {
    const statuses = Array.isArray(status) ? status : [status];
    return this.registry.listAgents().filter((agent) => statuses.includes(agent.status));
  }

  findByMetadata(metadata: Record<string, unknown>): AgentMetadata[] {
    return this.registry
      .listAgents()
      .filter((agent) => matchesMetadata(agent.metadata, metadata));
  }

  query(query: DiscoveryQuery): DiscoveryResult {
    let agents = this.registry.listAgents();

    if (query.capabilities instanceof RegExp) {
      const capabilityPattern = query.capabilities;
      agents = agents.filter((agent) =>
        agent.capabilities.some((capability) => capabilityPattern.test(capability))
      );
    } else if (query.capabilities) {
      const capabilities = query.capabilities;
      agents = agents.filter((agent) =>
        capabilities.some((capability) => matchesCapability(agent, capability))
      );
    }

    if (query.capabilityPattern) {
      const regex =
        query.capabilityPattern instanceof RegExp
          ? query.capabilityPattern
          : globToRegex(query.capabilityPattern);
      agents = agents.filter((agent) =>
        agent.capabilities.some((capability) => regex.test(capability))
      );
    }

    if (query.status) {
      agents = agents.filter((agent) => query.status?.includes(agent.status));
    }

    if (query.metadata) {
      agents = agents.filter((agent) => matchesMetadata(agent.metadata, query.metadata ?? {}));
    }

    return {
      agents,
      total: agents.length
    };
  }

  watch(query: DiscoveryQuery, callback: WatchCallback): () => void {
    this.watchers.set(callback, query);
    return () => {
      this.watchers.delete(callback);
    };
  }

  private notifyWatchers(): void {
    for (const [callback, query] of this.watchers) {
      callback(this.query(query).agents);
    }
  }
}
