import { z } from "zod";

// ============================================================================
// Permission Schemas
// ============================================================================

/**
 * Actions that can be performed on resources.
 */
export const PermissionActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "execute",
  "admin"
]);

/**
 * Condition operators for field-level permission checks.
 */
export const PermissionConditionOperatorSchema = z.enum([
  "eq",
  "ne",
  "gt",
  "lt",
  "gte",
  "lte",
  "in",
  "contains",
  "startsWith",
  "endsWith"
]);

/**
 * A condition for field-level permission checks.
 * Used to restrict permissions based on context values.
 */
export const PermissionConditionSchema = z.object({
  /** Field path (e.g., "task.complexity.total", "department") */
  field: z.string().min(1),
  /** Comparison operator */
  operator: PermissionConditionOperatorSchema,
  /** Value to compare against */
  value: z.unknown()
});

/**
 * A permission definition for a resource and action.
 * Conditions can further restrict when the permission applies.
 */
export const PermissionSchema = z.object({
  /** Resource identifier (e.g., "tasks", "runs", "governance/rules") */
  resource: z.string().min(1),
  /** Action that can be performed */
  action: PermissionActionSchema,
  /** Optional conditions for field-level checks */
  conditions: z.array(PermissionConditionSchema).optional()
});

// ============================================================================
// Role Schemas
// ============================================================================

/**
 * A role definition with optional hierarchy support (RBAC1).
 * Roles can inherit permissions from parent roles via parentRoleId.
 */
export const RoleSchema = z.object({
  /** Unique role identifier */
  id: z.string().uuid(),
  /** Human-readable role name */
  name: z.string().min(1).max(100),
  /** Optional description of the role */
  description: z.string().max(500).optional(),
  /** Parent role ID for inheritance (RBAC1 hierarchy) */
  parentRoleId: z.string().uuid().optional(),
  /** Direct permissions granted to this role (excluding inherited) */
  permissions: z.array(PermissionSchema),
  /** Priority for conflict resolution (higher = more authoritative) */
  priority: z.number().int().min(0).max(1000).default(100),
  /** Whether this is a system role (immutable) */
  isSystemRole: z.boolean().default(false),
  /** Creation timestamp */
  createdAt: z.string().datetime(),
  /** Last update timestamp */
  updatedAt: z.string().datetime()
});

/**
 * Resolved role hierarchy for a specific role.
 * Contains all ancestor role IDs for inheritance resolution.
 */
export const RoleHierarchySchema = z.object({
  /** The role ID */
  roleId: z.string().uuid(),
  /** All ancestor role IDs in the inheritance chain (immediate parent first) */
  ancestorRoleIds: z.array(z.string().uuid()),
  /** Depth of the inheritance chain (0 = no inheritance) */
  depth: z.number().int().min(0)
});

// ============================================================================
// Subject Schemas
// ============================================================================

/**
 * Subject type (who is performing the action).
 */
export const SubjectTypeSchema = z.enum(["user", "service", "system"]);

/**
 * A subject (user, service, or system) that can have roles assigned.
 */
export const SubjectSchema = z.object({
  /** Subject identifier (user ID, service name, or system identifier) */
  id: z.string().min(1),
  /** Type of subject */
  type: SubjectTypeSchema,
  /** Role IDs assigned to this subject */
  roles: z.array(z.string()),
  /** Dynamic attributes for condition evaluation (e.g., department, team) */
  attributes: z.record(z.string(), z.string())
});

// ============================================================================
// Permission Check Result Schemas
// ============================================================================

/**
 * Denial information when permission is explicitly denied.
 */
export const PermissionDeniedBySchema = z.object({
  /** The rule or policy that caused the denial */
  ruleId: z.string().optional(),
  /** Human-readable reason for denial */
  reason: z.string()
});

/**
 * Result of a permission check operation.
 * Contains detailed information about the decision.
 */
export const PermissionCheckResultSchema = z.object({
  /** Whether the permission was granted */
  granted: z.boolean(),
  /** The subject that was checked */
  subjectId: z.string(),
  /** Resource that was checked */
  resource: z.string(),
  /** Action that was checked */
  action: z.string(),
  /** Human-readable explanation of the decision */
  reason: z.string(),
  /** Permissions that matched and granted access (if granted) */
  matchedPermissions: z.array(PermissionSchema),
  /** Explicit denial information (if denied) */
  deniedBy: PermissionDeniedBySchema.optional(),
  /** When the check was performed */
  checkedAt: z.string().datetime()
});

// ============================================================================
// Role Assignment Schemas
// ============================================================================

/**
 * Assignment of a role to a subject.
 * Supports time-bound access via expiresAt.
 */
export const RoleAssignmentSchema = z.object({
  /** Unique assignment identifier */
  id: z.string().uuid(),
  /** Subject receiving the role */
  subjectId: z.string(),
  /** Type of subject */
  subjectType: z.enum(["user", "service"]),
  /** Role being assigned */
  roleId: z.string().uuid(),
  /** Admin who assigned the role */
  assignedBy: z.string(),
  /** When the assignment was created */
  assignedAt: z.string().datetime(),
  /** Optional expiration for temporary access (per SPEC-01) */
  expiresAt: z.string().datetime().optional(),
  /** Whether the assignment is currently active */
  isActive: z.boolean().default(true)
});

// ============================================================================
// Type Exports
// ============================================================================

export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type PermissionConditionOperator = z.infer<
  typeof PermissionConditionOperatorSchema
>;
export type PermissionCondition = z.infer<typeof PermissionConditionSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type RoleHierarchy = z.infer<typeof RoleHierarchySchema>;
export type SubjectType = z.infer<typeof SubjectTypeSchema>;
export type Subject = z.infer<typeof SubjectSchema>;
export type PermissionDeniedBy = z.infer<typeof PermissionDeniedBySchema>;
export type PermissionCheckResult = z.infer<typeof PermissionCheckResultSchema>;
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;
