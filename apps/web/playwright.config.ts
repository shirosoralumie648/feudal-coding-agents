import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const controlPlaneRoot = fileURLToPath(new URL("../control-plane", import.meta.url));
const webRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm exec node --import tsx src/server.ts",
      cwd: controlPlaneRoot,
      env: {
        FEUDAL_ACP_MODE: "mock",
        PORT: "4000"
      },
      url: "http://127.0.0.1:4000/api/agents",
      reuseExistingServer: true
    },
    {
      command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
      cwd: webRoot,
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true
    }
  ]
});
