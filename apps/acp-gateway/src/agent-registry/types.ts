/**
 * Agent Registry - Type definitions and metadata schema
 *
 * Defines the AgentManifest type and validation utilities for
 * ACP-compliant agent registration. Each agent declares its
 * capabilities, input/output schemas, and runtime hints.
 */

// ── Core Types ──────────────────────────────────────────────

/** Capability declared by an agent */
export interface AgentCapability {
  /** Unique capability identifier (e.g., "code-generation") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description of what this capability provides */
  description: string;
  /** Optional JSON Schema for capability-specific configuration */
  configSchema?: Record<string, unknown>;
}

/** Runtime hint for scheduling and resource allocation */
export interface RuntimeHint {
  /** Estimated execution time in milliseconds */
  estimatedDurationMs?: number;
  /** Memory requirement in MB */
  memoryMb?: number;
  /** Whether this agent can run concurrently with other agents */
  concurrent?: boolean;
  /** Priority level (0 = highest) */
  priority?: number;
}

/** Health status of a registered agent */
export type AgentHealthStatus = "healthy" | "degraded" | "unavailable";

/** Agent manifest - the registration document for an ACP agent */
export interface AgentManifest {
  /** Unique agent identifier (e.g., "coder-v1") */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Version string (semver recommended) */
  version: string;
  /** Agent description */
  description: string;
  /** Declared capabilities */
  capabilities: AgentCapability[];
  /** JSON Schema for task input validation */
  inputSchema: Record<string, unknown>;
  /** JSON Schema for task output validation */
  outputSchema: Record<string, unknown>;
  /** Runtime hints for the scheduler */
  runtimeHints: RuntimeHint;
  /** Health status */
  health: AgentHealthStatus;
  /** ISO 8601 timestamp of registration */
  registeredAt: string;
  /** ISO 8601 timestamp of last health check */
  lastHealthCheck?: string;
}

/** Event types emitted by the agent registry */
export type AgentRegistryEvent =
  | { type: "agent.registered"; agentId: string; timestamp: string }
  | { type: "agent.deregistered"; agentId: string; timestamp: string }
  | { type: "agent.health-changed"; agentId: string; health: AgentHealthStatus; timestamp: string };

// ── Validation ──────────────────────────────────────────────

/** Validation error detail */
export interface ValidationError {
  path: string;
  message: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Required top-level fields for a valid AgentManifest */
const REQUIRED_FIELDS: (keyof AgentManifest)[] = [
  "agentId",
  "name",
  "version",
  "description",
  "capabilities",
  "inputSchema",
  "outputSchema",
  "runtimeHints",
  "health",
  "registeredAt",
];

/**
 * Validate an AgentManifest for structural correctness.
 * Returns a ValidationResult with any errors found.
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (manifest === null || manifest === undefined || typeof manifest !== "object") {
    return { valid: false, errors: [{ path: "", message: "Manifest must be a non-null object" }] };
  }

  const obj = manifest as Record<string, unknown>;

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj) || obj[field] === undefined) {
      errors.push({ path: field, message: `Required field "${field}" is missing` });
    }
  }

  // Validate agentId format: lowercase alphanumeric with hyphens
  if ("agentId" in obj && typeof obj.agentId === "string") {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(obj.agentId) && obj.agentId.length >= 2) {
      errors.push({
        path: "agentId",
        message: 'agentId must be lowercase alphanumeric with hyphens (e.g., "coder-v1")',
      });
    }
    if (obj.agentId.length < 2) {
      errors.push({ path: "agentId", message: "agentId must be at least 2 characters" });
    }
  }

  // Validate version format (semver-like)
  if ("version" in obj && typeof obj.version === "string") {
    if (!/^\d+\.\d+\.\d+/.test(obj.version)) {
      errors.push({ path: "version", message: 'version must follow semver format (e.g., "1.0.0")' });
    }
  }

  // Validate capabilities is a non-empty array
  if ("capabilities" in obj) {
    if (!Array.isArray(obj.capabilities)) {
      errors.push({ path: "capabilities", message: "capabilities must be an array" });
    } else if (obj.capabilities.length === 0) {
      errors.push({ path: "capabilities", message: "capabilities must not be empty" });
    } else {
      obj.capabilities.forEach((cap: unknown, i: number) => {
        if (cap === null || typeof cap !== "object") {
          errors.push({ path: `capabilities[${i}]`, message: "Each capability must be an object" });
        } else {
          const capObj = cap as Record<string, unknown>;
          if (!("id" in capObj) || typeof capObj.id !== "string" || capObj.id.length === 0) {
            errors.push({ path: `capabilities[${i}].id`, message: "Capability id is required" });
          }
          if (!("name" in capObj) || typeof capObj.name !== "string" || capObj.name.length === 0) {
            errors.push({ path: `capabilities[${i}].name`, message: "Capability name is required" });
          }
        }
      });
    }
  }

  // Validate inputSchema is an object
  if ("inputSchema" in obj) {
    if (obj.inputSchema === null || typeof obj.inputSchema !== "object" || Array.isArray(obj.inputSchema)) {
      errors.push({ path: "inputSchema", message: "inputSchema must be a non-null object" });
    }
  }

  // Validate outputSchema is an object
  if ("outputSchema" in obj) {
    if (obj.outputSchema === null || typeof obj.outputSchema !== "object" || Array.isArray(obj.outputSchema)) {
      errors.push({ path: "outputSchema", message: "outputSchema must be a non-null object" });
    }
  }

  // Validate health status
  if ("health" in obj) {
    const validStatuses: AgentHealthStatus[] = ["healthy", "degraded", "unavailable"];
    if (!validStatuses.includes(obj.health as AgentHealthStatus)) {
      errors.push({
        path: "health",
        message: `health must be one of: ${validStatuses.join(", ")}`,
      });
    }
  }

  // Validate registeredAt is ISO 8601
  if ("registeredAt" in obj && typeof obj.registeredAt === "string") {
    if (isNaN(Date.parse(obj.registeredAt))) {
      errors.push({ path: "registeredAt", message: "registeredAt must be a valid ISO 8601 timestamp" });
    }
  }

  return { valid: errors.length === 0, errors };
}
