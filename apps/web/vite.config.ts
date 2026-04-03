import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:4000",
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: apiProxy
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: apiProxy
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "test-results/**"],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
