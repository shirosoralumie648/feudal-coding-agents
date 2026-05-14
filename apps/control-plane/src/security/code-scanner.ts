/**
 * Code security scanner for execution results.
 * Detects potentially dangerous patterns in generated code.
 */

export interface SecurityScanMatch {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  line?: number;
  context?: string;
}

export interface SecurityScanResult {
  isSecure: boolean;
  matches: SecurityScanMatch[];
  summary: string;
  recommendations: string[];
}

// Dangerous patterns in code
const DANGEROUS_PATTERNS: Array<{
  type: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  recommendation: string;
}> = [
  // Command injection risks
  {
    type: "eval",
    pattern: /\beval\s*\(/g,
    severity: "critical",
    description: "Use of eval() can lead to code injection",
    recommendation: "Avoid eval(). Use safer alternatives like JSON.parse() for data parsing."
  },
  {
    type: "exec",
    pattern: /(?:exec|spawn|execSync|spawnSync)\s*\(/g,
    severity: "high",
    description: "Use of command execution functions",
    recommendation: "Validate and sanitize all inputs. Use allowlists for commands."
  },
  {
    type: "child_process",
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g,
    severity: "high",
    description: "Import of child_process module",
    recommendation: "Ensure command execution is properly sandboxed and validated."
  },
  // File system risks
  {
    type: "fs_write",
    pattern: /(?:writeFile|writeFileSync|appendFile|appendFileSync)\s*\(/g,
    severity: "medium",
    description: "File write operations detected",
    recommendation: "Validate file paths and restrict write locations."
  },
  {
    type: "fs_delete",
    pattern: /(?:unlink|unlinkSync|rmdir|rmdirSync|rm|rmSync)\s*\(/g,
    severity: "high",
    description: "File deletion operations detected",
    recommendation: "Implement safeguards before file deletion. Consider trash/recycle approach."
  },
  // Network risks
  {
    type: "fetch_external",
    pattern: /(?:fetch|axios|http\.get|https\.get)\s*\(\s*['"`]https?:/g,
    severity: "medium",
    description: "External network requests detected",
    recommendation: "Validate URLs and consider using allowlists for external domains."
  },
  // Database risks
  {
    type: "sql_injection_risk",
    pattern: /(?:query|execute)\s*\(\s*[`'"][^`'"]*\$\{/g,
    severity: "critical",
    description: "Potential SQL injection vulnerability",
    recommendation: "Use parameterized queries instead of string interpolation."
  },
  // Authentication risks
  {
    type: "hardcoded_credentials",
    pattern: /(?:password|secret|api[_-]?key|token)\s*[=:]\s*['"][^'"]+['"]/gi,
    severity: "critical",
    description: "Hardcoded credentials detected",
    recommendation: "Use environment variables or secure credential storage."
  },
  // Crypto risks
  {
    type: "weak_crypto",
    pattern: /(?:md5|sha1)\s*\(/g,
    severity: "medium",
    description: "Weak cryptographic algorithm detected",
    recommendation: "Use stronger algorithms like SHA-256 or SHA-3."
  },
  {
    type: "math_random",
    pattern: /Math\.random\s*\(/g,
    severity: "low",
    description: "Math.random() is not cryptographically secure",
    recommendation: "Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive contexts."
  },
  // Process risks
  {
    type: "process_env",
    pattern: /process\.env\s*\[/g,
    severity: "low",
    description: "Direct environment variable access",
    recommendation: "Consider validating environment variables at startup."
  },
  {
    type: "process_exit",
    pattern: /process\.exit\s*\(/g,
    severity: "medium",
    description: "Process exit detected",
    recommendation: "Ensure graceful shutdown and cleanup before exit."
  }
];

export function scanCodeSecurity(code: string): SecurityScanResult {
  const matches: SecurityScanMatch[] = [];
  const recommendations: string[] = [];

  const lines = code.split("\n");

  for (const { type, pattern, severity, description, recommendation } of DANGEROUS_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.slice(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Get context (the line containing the match)
      const context = lines[lineNumber - 1]?.trim() ?? match[0];

      matches.push({
        type,
        severity,
        description,
        line: lineNumber,
        context
      });

      if (!recommendations.includes(recommendation)) {
        recommendations.push(recommendation);
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  matches.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate summary
  const critical = matches.filter((m) => m.severity === "critical").length;
  const high = matches.filter((m) => m.severity === "high").length;
  const medium = matches.filter((m) => m.severity === "medium").length;
  const low = matches.filter((m) => m.severity === "low").length;

  const summaryParts: string[] = [];
  if (critical > 0) summaryParts.push(`${critical} critical`);
  if (high > 0) summaryParts.push(`${high} high`);
  if (medium > 0) summaryParts.push(`${medium} medium`);
  if (low > 0) summaryParts.push(`${low} low`);

  const summary =
    matches.length === 0
      ? "No security issues detected"
      : `Found ${summaryParts.join(", ")} security issues`;

  return {
    isSecure: matches.filter((m) => m.severity === "critical" || m.severity === "high").length === 0,
    matches,
    summary,
    recommendations
  };
}

export function shouldBlockExecution(result: SecurityScanResult): boolean {
  // Block execution if there are critical or high severity issues
  return !result.isSecure;
}
