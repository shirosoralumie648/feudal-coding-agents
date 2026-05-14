import { describe, expect, it } from "vitest";
import { scanCodeSecurity, shouldBlockExecution } from "./code-scanner";

describe("code scanner", () => {
  describe("scanCodeSecurity", () => {
    it("detects eval usage", () => {
      const code = "const result = eval(userInput);";
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "eval")).toBe(true);
      expect(result.matches.some((m) => m.severity === "critical")).toBe(true);
    });

    it("detects command execution", () => {
      const code = "const { exec } = require('child_process');\nexec('ls -la');";
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "exec")).toBe(true);
      expect(result.matches.some((m) => m.severity === "high")).toBe(true);
    });

    it("detects SQL injection risk", () => {
      const code = "db.query(`SELECT * FROM users WHERE id = ${userId}`);";
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "sql_injection_risk")).toBe(true);
      expect(result.matches.some((m) => m.severity === "critical")).toBe(true);
    });

    it("detects hardcoded credentials", () => {
      const code = 'const password = "supersecret123";';
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "hardcoded_credentials")).toBe(true);
      expect(result.matches.some((m) => m.severity === "critical")).toBe(true);
    });

    it("detects file deletion operations", () => {
      const code = "fs.unlinkSync('/path/to/file');";
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "fs_delete")).toBe(true);
    });

    it("detects weak crypto", () => {
      const code = "const hash = md5(data);";
      const result = scanCodeSecurity(code);

      expect(result.matches.some((m) => m.type === "weak_crypto")).toBe(true);
    });

    it("returns clean for safe code", () => {
      const code = "const sum = (a, b) => a + b;\nconsole.log(sum(1, 2));";
      const result = scanCodeSecurity(code);

      expect(result.isSecure).toBe(true);
      expect(result.matches).toHaveLength(0);
      expect(result.summary).toBe("No security issues detected");
    });

    it("provides recommendations", () => {
      const code = "eval(userInput);";
      const result = scanCodeSecurity(code);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain("eval");
    });

    it("includes line numbers in matches", () => {
      const code = "const a = 1;\nconst b = eval(x);\nconst c = 3;";
      const result = scanCodeSecurity(code);

      const evalMatch = result.matches.find((m) => m.type === "eval");
      expect(evalMatch?.line).toBe(2);
    });
  });

  describe("shouldBlockExecution", () => {
    it("blocks critical severity issues", () => {
      const result = scanCodeSecurity("eval(userInput);");
      expect(shouldBlockExecution(result)).toBe(true);
    });

    it("blocks high severity issues", () => {
      const result = scanCodeSecurity("exec('rm -rf /');");
      expect(shouldBlockExecution(result)).toBe(true);
    });

    it("allows medium severity issues", () => {
      const result = scanCodeSecurity("fs.writeFile(path, data);");
      expect(shouldBlockExecution(result)).toBe(false);
    });

    it("allows clean code", () => {
      const result = scanCodeSecurity("const x = 1;");
      expect(shouldBlockExecution(result)).toBe(false);
    });
  });
});
