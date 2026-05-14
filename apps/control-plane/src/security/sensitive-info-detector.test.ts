import { describe, expect, it } from "vitest";
import { redactSensitiveInfo, scanForSensitiveInfo } from "./sensitive-info-detector";

describe("sensitive info detector", () => {
  describe("scanForSensitiveInfo", () => {
    it("detects API keys", () => {
      const content = "api_key=sk-1234567890abcdefghijklmnop";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "api_key")).toBe(true);
    });

    it("detects OpenAI keys", () => {
      const content = "sk-" + "a".repeat(48);
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "openai_key")).toBe(true);
    });

    it("detects AWS access keys", () => {
      const content = "AKIAIOSFODNN7EXAMPLE";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "aws_access_key")).toBe(true);
    });

    it("detects passwords", () => {
      const content = "password=supersecretpassword123";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "password")).toBe(true);
    });

    it("detects JWT tokens", () => {
      const content = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "jwt")).toBe(true);
    });

    it("detects database URLs", () => {
      const content = "postgres://user:pass@localhost:5432/mydb";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "database_url")).toBe(true);
    });

    it("detects private keys", () => {
      const content = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(true);
      expect(result.matches.some((m) => m.type === "private_key")).toBe(true);
    });

    it("returns empty for clean content", () => {
      const content = "This is a normal prompt without any sensitive information.";
      const result = scanForSensitiveInfo(content);

      expect(result.hasSensitiveInfo).toBe(false);
      expect(result.matches).toHaveLength(0);
      expect(result.summary).toBe("No sensitive information detected");
    });

    it("assigns correct severity levels", () => {
      const content = "password=supersecret123\nemail=test@example.com";
      const result = scanForSensitiveInfo(content);

      expect(result.matches.some((m) => m.severity === "high")).toBe(true);
      expect(result.matches.some((m) => m.severity === "low")).toBe(true);
    });
  });

  describe("redactSensitiveInfo", () => {
    it("redacts sensitive information", () => {
      const content = "api_key=sk-1234567890abcdefghijklmnop";
      const result = scanForSensitiveInfo(content);
      const redacted = redactSensitiveInfo(content, result.matches);

      expect(redacted).toContain("[REDACTED_API_KEY]");
      expect(redacted).not.toContain("sk-1234567890abcdefghijklmnop");
    });

    it("handles multiple matches", () => {
      const content = "api_key=abcdefghijklmnop123456 and password=supersecretpassword";
      const result = scanForSensitiveInfo(content);
      const redacted = redactSensitiveInfo(content, result.matches);

      expect(redacted).toContain("[REDACTED_API_KEY]");
      expect(redacted).toContain("[REDACTED_PASSWORD]");
      expect(redacted).not.toContain("abcdefghijklmnop123456");
      expect(redacted).not.toContain("supersecretpassword");
    });

    it("returns original content when no matches", () => {
      const content = "This is clean content";
      const result = scanForSensitiveInfo(content);
      const redacted = redactSensitiveInfo(content, result.matches);

      expect(redacted).toBe(content);
    });
  });
});
