/**
 * Role Management API Routes.
 *
 * Provides CRUD operations for roles and role assignments.
 * All endpoints protected by RBAC permission checks.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  Permission,
  Role,
  RoleAssignment
} from "@feudal/contracts";
import { RoleSchema, RoleAssignmentSchema } from "@feudal/contracts";
import { requirePermission } from "../governance/rbac-middleware";

// ============================================================================
// Request/Response Schemas
// ============================================================================

const RoleIdParamsSchema = z.object({
  id: z.string().uuid()
});

const RoleAssignmentIdParamsSchema = z.object({
  id: z.string().uuid()
});

const ListRolesQuerySchema = z.object({
  includeSystem: z.coerce.boolean().optional(),
  search: z.string().optional()
});

const ListAssignmentsQuerySchema = z.object({
  subjectId: z.string().optional(),
  roleId: z.string().uuid().optional(),
  activeOnly: z.coerce.boolean().optional()
});

const CreateRoleBodySchema = RoleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

const UpdateRoleBodySchema = RoleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).partial();

const CreateAssignmentBodySchema = RoleAssignmentSchema.omit({
  id: true,
  assignedAt: true
});

// ============================================================================
// System Roles (Per D-07)
// ============================================================================

/**
 * Default system roles that cannot be modified or deleted.
 */
export const SYSTEM_ROLES: Role[] = [
  {
    id: "role-admin",
    name: "admin",
    description: "Full administrative access to all resources",
    permissions: [
      { resource: "*", action: "admin" }
    ],
    priority: 1000,
    isSystemRole: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  },
  {
    id: "role-operator",
    name: "operator",
    description: "Task execution and monitoring permissions",
    permissions: [
      { resource: "tasks", action: "read" },
      { resource: "tasks", action: "create" },
      { resource: "tasks", action: "update" },
      { resource: "tasks", action: "execute" },
      { resource: "runs", action: "read" },
      { resource: "runs", action: "create" },
      { resource: "agents", action: "read" }
    ],
    priority: 500,
    isSystemRole: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  },
  {
    id: "role-viewer",
    name: "viewer",
    description: "Read-only access to tasks and runs",
    permissions: [
      { resource: "tasks", action: "read" },
      { resource: "runs", action: "read" },
      { resource: "agents", action: "read" }
    ],
    priority: 100,
    isSystemRole: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  },
  {
    id: "role-auditor",
    name: "auditor",
    description: "Read-only access plus audit log access for compliance",
    permissions: [
      { resource: "tasks", action: "read" },
      { resource: "runs", action: "read" },
      { resource: "agents", action: "read" },
      { resource: "audit", action: "read" },
      { resource: "roles", action: "read" }
    ],
    priority: 150,
    isSystemRole: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }
];

// ============================================================================
// In-Memory Store (for development)
// ============================================================================

/**
 * Simple in-memory role store.
 * In production, this would be backed by a database.
 */
class RoleStore {
  private roles: Map<string, Role> = new Map();
  private assignments: Map<string, RoleAssignment> = new Map();

  constructor() {
    // Initialize with system roles
    for (const role of SYSTEM_ROLES) {
      this.roles.set(role.id, role);
    }
  }

  listRoles(options?: { includeSystem?: boolean; search?: string }): Role[] {
    let roles = Array.from(this.roles.values());

    if (options?.includeSystem === false) {
      roles = roles.filter((r) => !r.isSystemRole);
    }

    if (options?.search) {
      const search = options.search.toLowerCase();
      roles = roles.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          r.description?.toLowerCase().includes(search)
      );
    }

    return roles.sort((a, b) => b.priority - a.priority);
  }

  getRole(id: string): Role | undefined {
    return this.roles.get(id);
  }

  createRole(role: Role): Role {
    this.roles.set(role.id, role);
    return role;
  }

  updateRole(id: string, updates: Partial<Role>): Role | undefined {
    const existing = this.roles.get(id);
    if (!existing) {
      return undefined;
    }

    if (existing.isSystemRole) {
      throw new Error("Cannot modify system roles");
    }

    const updated: Role = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.roles.set(id, updated);
    return updated;
  }

  deleteRole(id: string): boolean {
    const role = this.roles.get(id);
    if (!role) {
      return false;
    }

    if (role.isSystemRole) {
      throw new Error("Cannot delete system roles");
    }

    // Check for active assignments
    const activeAssignments = Array.from(this.assignments.values()).filter(
      (a) => a.roleId === id && a.isActive
    );
    if (activeAssignments.length > 0) {
      throw new Error("Cannot delete role with active assignments");
    }

    return this.roles.delete(id);
  }

  listAssignments(options?: {
    subjectId?: string;
    roleId?: string;
    activeOnly?: boolean;
  }): RoleAssignment[] {
    let assignments = Array.from(this.assignments.values());

    if (options?.subjectId) {
      assignments = assignments.filter((a) => a.subjectId === options.subjectId);
    }

    if (options?.roleId) {
      assignments = assignments.filter((a) => a.roleId === options.roleId);
    }

    if (options?.activeOnly) {
      const now = new Date();
      assignments = assignments.filter((a) => {
        if (!a.isActive) return false;
        if (a.expiresAt && new Date(a.expiresAt) < now) return false;
        return true;
      });
    }

    return assignments;
  }

  getAssignment(id: string): RoleAssignment | undefined {
    return this.assignments.get(id);
  }

  createAssignment(assignment: RoleAssignment): RoleAssignment {
    // Check for duplicate active assignment
    const existing = Array.from(this.assignments.values()).find(
      (a) =>
        a.subjectId === assignment.subjectId &&
        a.roleId === assignment.roleId &&
        a.isActive &&
        (!a.expiresAt || new Date(a.expiresAt) > new Date())
    );

    if (existing) {
      throw new Error("Active assignment already exists");
    }

    this.assignments.set(assignment.id, assignment);
    return assignment;
  }

  deleteAssignment(id: string): boolean {
    return this.assignments.delete(id);
  }
}

// Singleton store instance
const roleStore = new RoleStore();

// ============================================================================
// Route Handlers
// ============================================================================

async function ensureRoleExists(
  id: string,
  reply: FastifyReply
): Promise<Role | undefined> {
  const role = roleStore.getRole(id);
  if (!role) {
    reply.code(404).send({ message: "Role not found" });
    return undefined;
  }
  return role;
}

// ============================================================================
// Route Registration
// ============================================================================

/**
 * Register role management routes with the Fastify instance.
 *
 * @param app - The Fastify instance
 */
export function registerRoleRoutes(app: FastifyInstance): void {
  // List roles
  app.get<{ Querystring: z.infer<typeof ListRolesQuerySchema> }>(
    "/api/roles",
    {
      preHandler: requirePermission({ resource: "roles", action: "read" })
    },
    async (request, reply) => {
      const query = ListRolesQuerySchema.parse(request.query);
      return roleStore.listRoles(query);
    }
  );

  // Get role by ID
  app.get<{ Params: z.infer<typeof RoleIdParamsSchema> }>(
    "/api/roles/:id",
    {
      preHandler: requirePermission({ resource: "roles", action: "read" })
    },
    async (request, reply) => {
      const params = RoleIdParamsSchema.parse(request.params);
      const role = await ensureRoleExists(params.id, reply);
      if (!role) return reply;

      // Include effective permissions from hierarchy
      return role;
    }
  );

  // Create role
  app.post(
    "/api/roles",
    {
      preHandler: requirePermission({ resource: "roles", action: "create" })
    },
    async (request, reply) => {
      const body = CreateRoleBodySchema.parse(request.body);

      // Validate parentRoleId exists if provided
      if (body.parentRoleId && !roleStore.getRole(body.parentRoleId)) {
        return reply.code(400).send({ message: "Parent role not found" });
      }

      // Check for duplicate name
      const existing = roleStore.listRoles().find((r) => r.name === body.name);
      if (existing) {
        return reply.code(409).send({ message: "Role name already exists" });
      }

      const now = new Date().toISOString();
      const role: Role = {
        id: crypto.randomUUID(),
        ...body,
        isSystemRole: false,
        createdAt: now,
        updatedAt: now
      };

      roleStore.createRole(role);
      return reply.code(201).send(role);
    }
  );

  // Update role
  app.put<{ Params: z.infer<typeof RoleIdParamsSchema> }>(
    "/api/roles/:id",
    {
      preHandler: requirePermission({ resource: "roles", action: "update" })
    },
    async (request, reply) => {
      const params = RoleIdParamsSchema.parse(request.params);
      const body = UpdateRoleBodySchema.parse(request.body);

      try {
        const updated = roleStore.updateRole(params.id, body);
        if (!updated) {
          return reply.code(404).send({ message: "Role not found" });
        }
        return updated;
      } catch (error) {
        if (error instanceof Error) {
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  // Delete role
  app.delete<{ Params: z.infer<typeof RoleIdParamsSchema> }>(
    "/api/roles/:id",
    {
      preHandler: requirePermission({ resource: "roles", action: "delete" })
    },
    async (request, reply) => {
      const params = RoleIdParamsSchema.parse(request.params);

      try {
        const deleted = roleStore.deleteRole(params.id);
        if (!deleted) {
          return reply.code(404).send({ message: "Role not found" });
        }
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error) {
          return reply.code(400).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  // List role assignments
  app.get<{ Querystring: z.infer<typeof ListAssignmentsQuerySchema> }>(
    "/api/roles/assignments",
    {
      preHandler: requirePermission({ resource: "roles", action: "read" })
    },
    async (request) => {
      const query = ListAssignmentsQuerySchema.parse(request.query);
      return roleStore.listAssignments(query);
    }
  );

  // Create role assignment
  app.post(
    "/api/roles/assignments",
    {
      preHandler: requirePermission({ resource: "roles", action: "admin" })
    },
    async (request, reply) => {
      const body = CreateAssignmentBodySchema.parse(request.body);

      // Validate role exists
      if (!roleStore.getRole(body.roleId)) {
        return reply.code(400).send({ message: "Role not found" });
      }

      const assignment: RoleAssignment = {
        id: crypto.randomUUID(),
        ...body,
        assignedAt: new Date().toISOString()
      };

      try {
        roleStore.createAssignment(assignment);
        return reply.code(201).send(assignment);
      } catch (error) {
        if (error instanceof Error) {
          return reply.code(409).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  // Delete role assignment (revoke)
  app.delete<{ Params: z.infer<typeof RoleAssignmentIdParamsSchema> }>(
    "/api/roles/assignments/:id",
    {
      preHandler: requirePermission({ resource: "roles", action: "admin" })
    },
    async (request, reply) => {
      const params = RoleAssignmentIdParamsSchema.parse(request.params);
      const deleted = roleStore.deleteAssignment(params.id);
      if (!deleted) {
        return reply.code(404).send({ message: "Assignment not found" });
      }
      return reply.code(204).send();
    }
  );
}
