/**
 * RBAC Policy Engine for permission checking and role hierarchy resolution.
 *
 * Implements RBAC0 + RBAC1 (role hierarchy with inheritance) per D-04.
 * Permission granularity at API endpoint + data field level per D-05.
 */

import type {
  Permission,
  PermissionCheckResult,
  PermissionCondition,
  Role,
  RoleHierarchy,
  Subject
} from "@feudal/contracts";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when a permission check is denied.
 * Contains detailed information about the denial for audit logging.
 */
export class PermissionDeniedError extends Error {
  public readonly subjectId: string;
  public readonly resource: string;
  public readonly action: string;
  public readonly reason: string;
  public readonly deniedBy?: { ruleId?: string; reason: string };

  constructor(options: {
    subjectId: string;
    resource: string;
    action: string;
    reason: string;
    deniedBy?: { ruleId?: string; reason: string };
  }) {
    super(
      `Permission denied for subject ${options.subjectId}: ` +
        `${options.action} on ${options.resource} - ${options.reason}`
    );
    this.name = "PermissionDeniedError";
    this.subjectId = options.subjectId;
    this.resource = options.resource;
    this.action = options.action;
    this.reason = options.reason;
    this.deniedBy = options.deniedBy;
  }
}

// ============================================================================
// Role Hierarchy Cache
// ============================================================================

/**
 * Interface for caching role hierarchy relationships.
 * Used for efficient role inheritance resolution.
 */
export interface RoleHierarchyCache {
  /** Get immediate parent roles for a role */
  getParentRoles(roleId: string): string[];
  /** Get all ancestor roles in the inheritance chain */
  getAllAncestors(roleId: string): string[];
  /** Refresh the cache from the role store */
  refresh(): Promise<void>;
}

/**
 * In-memory implementation of RoleHierarchyCache.
 * Builds parent-child mappings from a flat list of roles.
 */
export class InMemoryRoleHierarchyCache implements RoleHierarchyCache {
  private parentByRole: Map<string, string> = new Map();
  private ancestorCache: Map<string, string[]> = new Map();

  constructor(roles: Role[]) {
    this.buildHierarchy(roles);
  }

  private buildHierarchy(roles: Role[]): void {
    for (const role of roles) {
      if (role.parentRoleId) {
        this.parentByRole.set(role.id, role.parentRoleId);
      }
    }

    // Detect circular references
    for (const role of roles) {
      this.detectCircularReference(role.id, new Set());
    }
  }

  private detectCircularReference(
    roleId: string,
    visited: Set<string>
  ): void {
    if (visited.has(roleId)) {
      throw new Error(
        `Circular role inheritance detected: ${Array.from(visited).join(" -> ")} -> ${roleId}`
      );
    }
    visited.add(roleId);

    const parent = this.getParentRoleId(roleId);
    if (parent) {
      this.detectCircularReference(parent, visited);
    }
  }

  private getParentRoleId(roleId: string): string | undefined {
    return this.parentByRole.get(roleId);
  }

  getParentRoles(roleId: string): string[] {
    const parentRoleId = this.parentByRole.get(roleId);
    return parentRoleId ? [parentRoleId] : [];
  }

  getAllAncestors(roleId: string): string[] {
    // Check cache first
    const cached = this.ancestorCache.get(roleId);
    if (cached) {
      return cached;
    }

    // Compute ancestors via BFS
    const ancestors: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [roleId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const parents = this.getParentRoles(current);
      for (const parent of parents) {
        if (!visited.has(parent)) {
          ancestors.push(parent);
          queue.push(parent);
        }
      }
    }

    this.ancestorCache.set(roleId, ancestors);
    return ancestors;
  }

  async refresh(): Promise<void> {
    this.ancestorCache.clear();
  }
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Options for permission checking.
 */
export interface CheckPermissionOptions {
  /** Context values for condition evaluation */
  context?: Record<string, unknown>;
  /** Cache for role hierarchy lookups */
  hierarchyCache?: RoleHierarchyCache;
  /** Role definitions for lookup */
  roleDefinitions?: Map<string, Role>;
}

/**
 * Check if a subject has a specific permission.
 *
 * @param subject - The subject (user/service/system) to check
 * @param permission - The permission to check
 * @param options - Additional options for context and caching
 * @returns PermissionCheckResult with granted/denied status and details
 */
export function checkPermission(
  subject: Subject,
  permission: Permission,
  options?: CheckPermissionOptions
): PermissionCheckResult {
  const checkedAt = new Date().toISOString();
  const roleDefinitions = options?.roleDefinitions ?? new Map();
  const hierarchyCache = options?.hierarchyCache;

  // Get all roles for the subject (direct + inherited)
  const allRoleIds = resolveRoles(subject, hierarchyCache);

  // Check if any role grants the permission
  const matchedPermissions: Permission[] = [];

  for (const roleId of allRoleIds) {
    const role = roleDefinitions.get(roleId);
    if (!role) {
      continue;
    }

    // Check direct permissions
    for (const rolePerm of role.permissions) {
      if (
        resourceMatches(rolePerm.resource, permission.resource) &&
        actionMatches(rolePerm.action, permission.action)
      ) {
        // Evaluate conditions if present
        if (
          rolePerm.conditions &&
          rolePerm.conditions.length > 0 &&
          options?.context
        ) {
          const conditionsMet = rolePerm.conditions.every((condition: PermissionCondition) =>
            evaluateCondition(condition, options.context!)
          );
          if (!conditionsMet) {
            continue;
          }
        }

        matchedPermissions.push(rolePerm);
      }
    }
  }

  // Determine result
  if (matchedPermissions.length > 0) {
    return {
      granted: true,
      subjectId: subject.id,
      resource: permission.resource,
      action: permission.action,
      reason: `Permission granted via ${matchedPermissions.length} matching permission(s)`,
      matchedPermissions,
      checkedAt
    };
  }

  // Permission denied
  return {
    granted: false,
    subjectId: subject.id,
    resource: permission.resource,
    action: permission.action,
    reason: `No role grants ${permission.action} on ${permission.resource}`,
    matchedPermissions: [],
    deniedBy: {
      reason: "No matching permission found in subject's roles"
    },
    checkedAt
  };
}

function resourceMatches(
  roleResource: string,
  requestedResource: string
): boolean {
  return roleResource === requestedResource || roleResource === "*";
}

function actionMatches(
  roleAction: Permission["action"],
  requestedAction: Permission["action"]
): boolean {
  return roleAction === requestedAction || roleAction === "admin";
}

/**
 * Check multiple permissions in a single call.
 *
 * @param subject - The subject to check
 * @param permissions - The permissions to check
 * @param options - Additional options
 * @returns Array of PermissionCheckResult for each permission
 */
export function checkPermissions(
  subject: Subject,
  permissions: Permission[],
  options?: CheckPermissionOptions
): PermissionCheckResult[] {
  return permissions.map((permission) =>
    checkPermission(subject, permission, options)
  );
}

/**
 * Check if a subject has all specified permissions.
 *
 * @param subject - The subject to check
 * @param permissions - The permissions to check
 * @param options - Additional options
 * @returns true if all permissions are granted, false otherwise
 */
export function hasAllPermissions(
  subject: Subject,
  permissions: Permission[],
  options?: CheckPermissionOptions
): boolean {
  const results = checkPermissions(subject, permissions, options);
  return results.every((result) => result.granted);
}

/**
 * Check if a subject has any of the specified permissions.
 *
 * @param subject - The subject to check
 * @param permissions - The permissions to check
 * @param options - Additional options
 * @returns true if any permission is granted, false otherwise
 */
export function hasAnyPermission(
  subject: Subject,
  permissions: Permission[],
  options?: CheckPermissionOptions
): boolean {
  const results = checkPermissions(subject, permissions, options);
  return results.some((result) => result.granted);
}

// ============================================================================
// Role Resolution
// ============================================================================

/**
 * Resolve all role IDs for a subject, including inherited roles.
 *
 * @param subject - The subject to resolve roles for
 * @param hierarchyCache - Optional cache for hierarchy lookups
 * @returns Array of role IDs (direct + inherited)
 */
export function resolveRoles(
  subject: Subject,
  hierarchyCache?: RoleHierarchyCache
): string[] {
  const allRoles = new Set<string>(subject.roles);

  // Add inherited roles
  if (hierarchyCache) {
    for (const roleId of subject.roles) {
      const ancestors = hierarchyCache.getAllAncestors(roleId);
      for (const ancestor of ancestors) {
        allRoles.add(ancestor);
      }
    }
  }

  return Array.from(allRoles);
}

/**
 * Build a role hierarchy map from a list of roles.
 *
 * @param roles - The roles to build hierarchy from
 * @returns Map of role ID to RoleHierarchy
 */
export function buildRoleHierarchyMap(roles: Role[]): Map<string, RoleHierarchy> {
  const hierarchyMap = new Map<string, RoleHierarchy>();

  // First pass: create entries
  for (const role of roles) {
    hierarchyMap.set(role.id, {
      roleId: role.id,
      ancestorRoleIds: [],
      depth: 0
    });
  }

  // Second pass: compute ancestors and depth
  for (const role of roles) {
    if (role.parentRoleId) {
      const entry = hierarchyMap.get(role.id);
      if (entry) {
        const ancestors = computeAncestors(role.id, roles, new Set());
        entry.ancestorRoleIds = ancestors;
        entry.depth = ancestors.length;
      }
    }
  }

  return hierarchyMap;
}

/**
 * Compute ancestor role IDs for a given role.
 */
function computeAncestors(
  roleId: string,
  roles: Role[],
  visited: Set<string>
): string[] {
  if (visited.has(roleId)) {
    // Circular reference detected
    return [];
  }
  visited.add(roleId);

  const role = roles.find((r) => r.id === roleId);
  if (!role || !role.parentRoleId) {
    return [];
  }

  const parent = roles.find((r) => r.id === role.parentRoleId);
  if (!parent) {
    return [];
  }

  return [
    role.parentRoleId,
    ...computeAncestors(role.parentRoleId, roles, visited)
  ];
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Evaluate a permission condition against a context.
 *
 * @param condition - The condition to evaluate
 * @param context - The context to evaluate against
 * @returns true if the condition is met, false otherwise
 */
export function evaluateCondition(
  condition: PermissionCondition,
  context: Record<string, unknown>
): boolean {
  const fieldValue = getNestedValue(context, condition.field);

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;

    case "ne":
      return fieldValue !== condition.value;

    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue > condition.value
      );

    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue < condition.value
      );

    case "gte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue >= condition.value
      );

    case "lte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue <= condition.value
      );

    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);

    case "contains":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.includes(condition.value)
      );

    case "startsWith":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.startsWith(condition.value)
      );

    case "endsWith":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.endsWith(condition.value)
      );

    default:
      return false;
  }
}

/**
 * Get a nested value from an object using dot notation.
 *
 * @param obj - The object to get the value from
 * @param path - The dot-notation path (e.g., "task.complexity.total")
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================================
// Cache Creation
// ============================================================================

/**
 * Create a role hierarchy cache from a list of roles.
 *
 * @param roles - The roles to build the cache from
 * @returns A RoleHierarchyCache instance
 */
export function createRoleHierarchyCache(roles: Role[]): RoleHierarchyCache {
  return new InMemoryRoleHierarchyCache(roles);
}
