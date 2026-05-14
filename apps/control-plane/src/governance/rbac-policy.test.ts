import { describe, expect, it } from "vitest";
import type { Role, Subject } from "@feudal/contracts";
import { checkPermission, createRoleHierarchyCache } from "./rbac-policy";

const adminRole: Role = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "admin",
  permissions: [{ resource: "*", action: "admin" }],
  priority: 1000,
  isSystemRole: true,
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z"
};

function makeSubject(roleIds: string[]): Subject {
  return {
    id: "user-1",
    type: "user",
    roles: roleIds,
    attributes: {}
  };
}

describe("rbac policy", () => {
  it("treats wildcard admin permissions as full access", () => {
    const result = checkPermission(
      makeSubject([adminRole.id]),
      { resource: "roles", action: "read" },
      { roleDefinitions: new Map([[adminRole.id, adminRole]]) }
    );

    expect(result.granted).toBe(true);
  });

  it("resolves parent role permissions through the hierarchy cache", () => {
    const viewerRole: Role = {
      id: "00000000-0000-4000-8000-000000000002",
      name: "viewer",
      permissions: [{ resource: "tasks", action: "read" }],
      priority: 100,
      isSystemRole: false,
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const reviewerRole: Role = {
      id: "00000000-0000-4000-8000-000000000003",
      name: "reviewer",
      parentRoleId: viewerRole.id,
      permissions: [{ resource: "tasks", action: "approve" }],
      priority: 200,
      isSystemRole: false,
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const roles = [viewerRole, reviewerRole];

    const result = checkPermission(
      makeSubject([reviewerRole.id]),
      { resource: "tasks", action: "read" },
      {
        roleDefinitions: new Map(roles.map((role) => [role.id, role])),
        hierarchyCache: createRoleHierarchyCache(roles)
      }
    );

    expect(result.granted).toBe(true);
  });
});
