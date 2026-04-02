import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerTaskRoutes } from "./tasks";
import { registerAgentRoutes } from "./agents";

describe("control-plane routes", () => {
  it("creates a task and stops at awaiting approval", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("awaiting_approval");
  });

  it("approves a task and drives it to completion", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const taskId = created.json().id;
    const approval = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("completed");
  });

  it("returns 404 when approving an unknown task", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/missing-task/approve"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Task not found" });
  });
});
