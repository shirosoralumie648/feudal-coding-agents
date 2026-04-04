import { describe, expect, it } from "vitest";
import { webServerCommand } from "./playwright-webserver";

describe("playwright web server config", () => {
  it("uses a lightweight vite server for the web E2E webServer", () => {
    expect(webServerCommand).toBe(
      "pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort"
    );
  });
});
