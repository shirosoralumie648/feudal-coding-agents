/**
 * RBAC Middleware for Fastify.
 *
 * Provides permission checking middleware for protecting routes.
 * Implements permission granularity at API endpoint level per D-05.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type {
  Permission,
  PermissionCheckResult,
  Subject
} from "@feudal/contracts";
import {
  checkPermission,
  checkPermissions,
  PermissionDeniedError
} from "./rbac-policy";

// ============================================================================
// Subject Extraction
// ============================================================================

/**
 * Options for subject extraction.
 */
export interface SubjectExtractionOptions {
  /** Header name for API key authentication */
  apiKeyHeader?: string;
  /** Header name for JWT token */
  authHeader?: string;
  /** Session property name for authenticated user */
  sessionUserProp?: string;
}

const DEFAULT_OPTIONS: SubjectExtractionOptions = {
  apiKeyHeader: "x-api-key",
  authHeader: "authorization",
  sessionUserProp: "user"
};

/**
 * Extract the subject (actor) from a Fastify request.
 *
 * Checks multiple sources in order:
 * 1. Session/user property (web authentication)
 * 2. JWT token in Authorization header
 * 3. API key header
 *
 * @param request - The Fastify request
 * @param options - Extraction options
 * @returns The subject if authenticated, undefined otherwise
 */
export function extractSubjectFromRequest(
  request: FastifyRequest,
  options?: SubjectExtractionOptions
): Subject | undefined {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Try session user first
  const sessionUser = (request as FastifyRequest & Record<string, unknown>)[
    opts.sessionUserProp!
  ];
  if (sessionUser && typeof sessionUser === "object") {
    const user = sessionUser as { id?: string; roles?: string[] };
    if (user.id) {
      return {
        id: user.id,
        type: "user",
        roles: user.roles ?? [],
        attributes: {}
      };
    }
  }

  // Try Authorization header (JWT)
  const authHeader = request.headers[opts.authHeader!];
  if (authHeader && typeof authHeader === "string") {
    // JWT token parsing would go here
    // For now, we assume the JWT is validated by a previous hook
    // and the subject is attached to the request
    const jwtSubject = (request as FastifyRequest & { jwtSubject?: Subject })
      .jwtSubject;
    if (jwtSubject) {
      return jwtSubject;
    }
  }

  // Try API key
  const apiKey = request.headers[opts.apiKeyHeader!];
  if (apiKey && typeof apiKey === "string") {
    // API key validation would resolve to a service subject
    // For now, we assume it's attached by a previous hook
    const apiKeySubject = (
      request as FastifyRequest & { apiKeySubject?: Subject }
    ).apiKeySubject;
    if (apiKeySubject) {
      return apiKeySubject;
    }
  }

  return undefined;
}

// ============================================================================
// Permission Middleware
// ============================================================================

/**
 * Options for requirePermission middleware.
 */
export interface RequirePermissionOptions {
  /** Allow unauthenticated requests (guest access) */
  allowGuest?: boolean;
  /** Custom error message on denial */
  errorMessage?: string;
  /** Subject extraction options */
  extractionOptions?: SubjectExtractionOptions;
}

/**
 * Create a middleware that requires a specific permission.
 *
 * @param permission - The permission required
 * @param options - Middleware options
 * @returns Fastify preHandler hook
 */
export function requirePermission(
  permission: Permission,
  options?: RequirePermissionOptions
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const subject = extractSubjectFromRequest(
      request,
      options?.extractionOptions
    );

    // Handle unauthenticated requests
    if (!subject) {
      if (options?.allowGuest) {
        // Attach empty result for guest
        (request as FastifyRequest & { permissionCheck?: PermissionCheckResult }).permissionCheck = {
          granted: false,
          subjectId: "guest",
          resource: permission.resource,
          action: permission.action,
          reason: "Guest access - no permissions",
          matchedPermissions: [],
          checkedAt: new Date().toISOString()
        };
        return;
      }

      return reply.code(401).send({
        message: "Authentication required",
        resource: permission.resource,
        action: permission.action
      });
    }

    // Check permission
    const result = checkPermission(subject, permission, {
      context: request.context as Record<string, unknown> | undefined,
      roleDefinitions: getRoleDefinitions(request),
      hierarchyCache: getHierarchyCache(request)
    });

    if (!result.granted) {
      const message =
        options?.errorMessage ??
        `Permission denied: ${permission.action} on ${permission.resource}`;
      return reply.code(403).send({
        message,
        resource: permission.resource,
        action: permission.action,
        reason: result.reason
      });
    }

    // Attach result to request for downstream use
    (request as FastifyRequest & { permissionCheck?: PermissionCheckResult }).permissionCheck = result;
  };
}

/**
 * Create a middleware that requires ANY of the specified permissions.
 *
 * @param permissions - The permissions (any one grants access)
 * @param options - Middleware options
 * @returns Fastify preHandler hook
 */
export function requireAnyPermission(
  permissions: Permission[],
  options?: RequirePermissionOptions
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const subject = extractSubjectFromRequest(
      request,
      options?.extractionOptions
    );

    if (!subject && !options?.allowGuest) {
      return reply.code(401).send({
        message: "Authentication required"
      });
    }

    if (!subject) {
      return; // Guest allowed
    }

    const results = checkPermissions(subject, permissions, {
      context: request.context as Record<string, unknown> | undefined,
      roleDefinitions: getRoleDefinitions(request),
      hierarchyCache: getHierarchyCache(request)
    });

    const granted = results.some((r) => r.granted);
    if (!granted) {
      return reply.code(403).send({
        message: "Permission denied",
        required: permissions.map((p) => `${p.action}:${p.resource}`).join(", ")
      });
    }
  };
}

/**
 * Create a middleware that requires ALL specified permissions.
 *
 * @param permissions - The permissions (all must be granted)
 * @param options - Middleware options
 * @returns Fastify preHandler hook
 */
export function requireAllPermissions(
  permissions: Permission[],
  options?: RequirePermissionOptions
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const subject = extractSubjectFromRequest(
      request,
      options?.extractionOptions
    );

    if (!subject && !options?.allowGuest) {
      return reply.code(401).send({
        message: "Authentication required"
      });
    }

    if (!subject) {
      return; // Guest allowed
    }

    const results = checkPermissions(subject, permissions, {
      context: request.context as Record<string, unknown> | undefined,
      roleDefinitions: getRoleDefinitions(request),
      hierarchyCache: getHierarchyCache(request)
    });

    const denied = results.filter((r) => !r.granted);
    if (denied.length > 0) {
      return reply.code(403).send({
        message: "Permission denied",
        missing: denied.map(
          (r) => `${r.action}:${r.resource}`
        )
      });
    }
  };
}

// ============================================================================
// Helpers for getting role data from request
// ============================================================================

interface RequestWithRBAC {
  roleDefinitions?: Map<string, import("@feudal/contracts").Role>;
  hierarchyCache?: import("./rbac-policy").RoleHierarchyCache;
}

function getRoleDefinitions(
  request: FastifyRequest
): Map<string, import("@feudal/contracts").Role> | undefined {
  return (request as FastifyRequest & RequestWithRBAC).roleDefinitions;
}

function getHierarchyCache(
  request: FastifyRequest
): import("./rbac-policy").RoleHierarchyCache | undefined {
  return (request as FastifyRequest & RequestWithRBAC).hierarchyCache;
}

// ============================================================================
// Fastify Decorator
// ============================================================================

/**
 * Register a decorator on the Fastify request for permission checking.
 *
 * This allows route handlers to check permissions imperatively:
 * `await request.checkPermission(permission)`
 *
 * @param app - The Fastify instance
 */
export function registerPermissionCheckDecorator(app: FastifyInstance): void {
  app.decorateRequest("checkPermission", function (
    this: FastifyRequest,
    permission: Permission
  ): PermissionCheckResult {
    const subject = extractSubjectFromRequest(this);
    if (!subject) {
      return {
        granted: false,
        subjectId: "unknown",
        resource: permission.resource,
        action: permission.action,
        reason: "No subject found",
        matchedPermissions: [],
        checkedAt: new Date().toISOString()
      };
    }

    return checkPermission(subject, permission, {
      context: this.context as Record<string, unknown> | undefined,
      roleDefinitions: getRoleDefinitions(this),
      hierarchyCache: getHierarchyCache(this)
    });
  });
}

// Augment Fastify types
declare module "fastify" {
  interface FastifyRequest {
    checkPermission(permission: Permission): PermissionCheckResult;
    permissionCheck?: PermissionCheckResult;
  }
}
