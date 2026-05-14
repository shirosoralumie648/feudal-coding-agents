import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { createControlPlaneApp } from "../server";
import { registerRoleRoutes } from "./roles";

function createAuthenticatedRolesApp() {
  const app = Fastify();
  app.addHook("preHandler", async (request: FastifyRequest) => {
    (request as FastifyRequest & {
      user?: { id: string; roles: string[] };
    }).user = {
      id: "admin-user",
      roles: ["role-admin"]
    };
  });
  registerRoleRoutes(app);
  return app;
}

describe("role routes", () => {
  it("wires role routes into the default control-plane app", async () => {
    const app = createControlPlaneApp({ logger: false });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/roles"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe("Authentication required");
    } finally {
      await app.close();
    }
  });

  it("lets an authenticated admin list system roles", async () => {
    const app = createAuthenticatedRolesApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/roles"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((role: { name: string }) => role.name)).toEqual(
        expect.arrayContaining(["admin", "operator", "viewer", "auditor"])
      );
    } finally {
      await app.close();
    }
  });

  it("lets an authenticated admin create a custom role with permissions", async () => {
    const app = createAuthenticatedRolesApp();
    const roleName = `release-manager-${crypto.randomUUID()}`;

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/roles",
        payload: {
          name: roleName,
          description: "Can approve release tasks",
          permissions: [{ resource: "tasks", action: "approve" }],
          priority: 250
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: roleName,
        permissions: [{ resource: "tasks", action: "approve" }],
        isSystemRole: false
      });
      expect(response.json().id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    } finally {
      await app.close();
    }
  });
});
