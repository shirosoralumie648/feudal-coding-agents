/**
 * Sensitive information detection for prompts and content.
 * Detects API keys, passwords, secrets, and other sensitive patterns.
 */

export interface SensitiveInfoMatch {
  type: string;
  pattern: string;
  startIndex: number;
  endIndex: number;
  severity: "high" | "medium" | "low";
  description: string;
}

export interface SensitiveInfoScanResult {
  hasSensitiveInfo: boolean;
  matches: SensitiveInfoMatch[];
  summary: string;
}

// Common patterns for sensitive information
const SENSITIVE_PATTERNS: Array<{
  type: string;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
  description: string;
}> = [
  // API Keys
  {
    type: "api_key",
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/gi,
    severity: "high",
    description: "API key detected"
  },
  {
    type: "openai_key",
    pattern: /sk-[a-zA-Z0-9]{48,}/g,
    severity: "high",
    description: "OpenAI API key detected"
  },
  {
    type: "anthropic_key",
    pattern: /sk-ant-[a-zA-Z0-9_-]{80,}/g,
    severity: "high",
    description: "Anthropic API key detected"
  },
  {
    type: "aws_access_key",
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    severity: "high",
    description: "AWS access key detected"
  },
  {
    type: "aws_secret_key",
    pattern: /(?:aws[_-]?secret[_-]?key|aws[_-]?secret)\s*[=:]\s*['"]?[a-zA-Z0-9/+=]{40}['"]?/gi,
    severity: "high",
    description: "AWS secret key detected"
  },
  // Passwords
  {
    type: "password",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi,
    severity: "high",
    description: "Password detected"
  },
  // Tokens
  {
    type: "bearer_token",
    pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi,
    severity: "high",
    description: "Bearer token detected"
  },
  {
    type: "jwt",
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: "medium",
    description: "JWT token detected"
  },
  // Database URLs
  {
    type: "database_url",
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
    severity: "high",
    description: "Database URL detected"
  },
  // Private keys
  {
    type: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    severity: "high",
    description: "Private key detected"
  },
  // Generic secrets
  {
    type: "secret",
    pattern: /(?:secret|token)\s*[=:]\s*['"]?[a-zA-Z0-9_-]{16,}['"]?/gi,
    severity: "medium",
    description: "Secret or token detected"
  },
  // Credit card numbers (basic pattern)
  {
    type: "credit_card",
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    severity: "high",
    description: "Credit card number detected"
  },
  // Email addresses (lower severity)
  {
    type: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: "low",
    description: "Email address detected"
  }
];

export function scanForSensitiveInfo(content: string): SensitiveInfoScanResult {
  const matches: SensitiveInfoMatch[] = [];

  for (const { type, pattern, severity, description } of SENSITIVE_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      matches.push({
        type,
        pattern: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        severity,
        description
      });
    }
  }

  // Sort by start index
  matches.sort((a, b) => a.startIndex - b.startIndex);

  // Generate summary
  const highSeverity = matches.filter((m) => m.severity === "high").length;
  const mediumSeverity = matches.filter((m) => m.severity === "medium").length;
  const lowSeverity = matches.filter((m) => m.severity === "low").length;

  const summaryParts: string[] = [];
  if (highSeverity > 0) {
    summaryParts.push(`${highSeverity} high severity`);
  }
  if (mediumSeverity > 0) {
    summaryParts.push(`${mediumSeverity} medium severity`);
  }
  if (lowSeverity > 0) {
    summaryParts.push(`${lowSeverity} low severity`);
  }

  const summary =
    matches.length === 0
      ? "No sensitive information detected"
      : `Found ${summaryParts.join(", ")} sensitive information patterns`;

  return {
    hasSensitiveInfo: matches.length > 0,
    matches,
    summary
  };
}

export function redactSensitiveInfo(
  content: string,
  matches: SensitiveInfoMatch[]
): string {
  if (matches.length === 0) {
    return content;
  }

  // Sort by start index descending to replace from end to start
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

  let redacted = content;
  for (const match of sortedMatches) {
    const redactedValue = `[REDACTED_${match.type.toUpperCase()}]`;
    redacted =
      redacted.slice(0, match.startIndex) +
      redactedValue +
      redacted.slice(match.endIndex);
  }

  return redacted;
}
