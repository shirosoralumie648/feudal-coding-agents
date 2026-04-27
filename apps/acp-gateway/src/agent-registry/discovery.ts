/**
 * Agent Discovery Service - Query and filter agents by capabilities
 *
 * Provides discovery mechanisms for finding agents by:
 * - Exact capability match
 * - Glob/regex pattern matching (e.g., "code-*" per D-07)
 * - Health status filtering
 * - Combined queries
 */

import type { AgentManifest, AgentHealthStatus } from "./types";
import type { AgentRegistry } from "./registry";

// ── Types ──────────────────────────────────────────────

export interface DiscoveryQuery {
  capabilities?: string[];
  capabilityPattern?: string | RegExp;
  health?: AgentHealthStatus | AgentHealthStatus[];
}

export interface Unsubscribe {
  (): void;
}

type WatchCallback = (agents: AgentManifest[]) => void;

// ── Implementation ──────────────────────────────────────

export class AgentDiscoveryService {
  private readonly registry: AgentRegistry;
  private readonly watchers = new Map<WatchCallback, DiscoveryQuery>();

  constructor(registry: AgentRegistry) {
    this.registry = registry;

    // Auto-subscribe to registry changes
    this.registry.onChange(() => {
      this.notifyWatchers();
    });
  }

  /**
   * Find agents with a specific capability (exact match).
   */
  findByCapability(capability: string): AgentManifest[] {
    return this.registry.listAgents().filter((agent) =>
      agent.capabilities.some((cap) => cap.id === capability)
    );
  }

  /**
   * Find agents matching a capability pattern.
   * Supports glob-style patterns like "code-*" per D-07.
   */
  findByCapabilityPattern(pattern: string | RegExp): AgentManifest[] {
    const regex = typeof pattern === "string" ? globToRegex(pattern) : pattern;

    return this.registry.listAgents().filter((agent) =>
      agent.capabilities.some((cap) => regex.test(cap.id))
    );
  }

  /**
   * Find agents by health status.
   */
  findByHealth(health: AgentHealthStatus | AgentHealthStatus[]): AgentManifest[] {
    const healthArray = Array.isArray(health) ? health : [health];

    return this.registry.listAgents().filter((agent) =>
      healthArray.includes(agent.health)
    );
  }

  /**
   * Query agents with combined filters.
   */
  query(query: DiscoveryQuery): AgentManifest[] {
    let agents = this.registry.listAgents();

    if (query.capabilities) {
      agents = agents.filter((agent) =>
        query.capabilities!.some((cap) =>
          agent.capabilities.some((agentCap) => agentCap.id === cap)
        )
      );
    }

    if (query.capabilityPattern) {
      const regex =
        typeof query.capabilityPattern === "string"
          ? globToRegex(query.capabilityPattern)
          : query.capabilityPattern;

      agents = agents.filter((agent) =>
        agent.capabilities.some((cap) => regex.test(cap.id))
      );
    }

    if (query.health) {
      const healthArray = Array.isArray(query.health) ? query.health : [query.health];
      agents = agents.filter((agent) => healthArray.includes(agent.health));
    }

    return agents;
  }

  /**
   * Watch for changes to agents matching a query.
   * Returns an unsubscribe function.
   *
   * Note: This is a simplified implementation that watches for health changes.
   * A full implementation would track all registry events.
   */
  watch(query: DiscoveryQuery, callback: WatchCallback): Unsubscribe {
    this.watchers.set(callback, query);

    // Return unsubscribe function
    return () => {
      this.watchers.delete(callback);
    };
  }

  /**
   * Notify watchers of a change. Called by the registry when an agent changes.
   * This is an internal method - the registry should call it when health changes.
   */
  notifyWatchers(): void {
    for (const [callback, query] of this.watchers) {
      const agents = this.query(query);
      callback(agents);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Convert a glob-style pattern to a RegExp.
 * Supports * (matches any characters except /)
 */
function globToRegex(glob: string): RegExp {
  // Escape special regex characters except *
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Convert * to .*
  const pattern = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${pattern}$`);
}
