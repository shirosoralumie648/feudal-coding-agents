import {
  scanCodeSecurity,
  shouldBlockExecution,
  type SecurityScanResult
} from "./code-scanner";
import {
  redactSensitiveInfo,
  scanForSensitiveInfo,
  type SensitiveInfoScanResult
} from "./sensitive-info-detector";

export interface ExecutionArtifactInput {
  id?: string;
  kind?: string;
  name?: string;
  content: unknown;
}

export interface ExecutionSecurityScanDiagnostic {
  source: string;
  severity: string;
  type: string;
  description: string;
  context?: string;
}

export interface ExecutionSecurityScanReport {
  blocked: boolean;
  summary: string;
  code: SecurityScanResult;
  sensitiveInfo: SensitiveInfoScanResult;
  diagnostics: ExecutionSecurityScanDiagnostic[];
}

function serializeContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function sourceName(artifact: ExecutionArtifactInput, index: number) {
  return `artifact:${artifact.id ?? artifact.name ?? index}`;
}

function redactText(text: string) {
  return redactSensitiveInfo(text, scanForSensitiveInfo(text).matches);
}

export function scanExecutionArtifacts(
  artifacts: ExecutionArtifactInput[]
): ExecutionSecurityScanReport {
  const combinedText = artifacts
    .map((artifact, index) => {
      return `${sourceName(artifact, index)}\n${serializeContent(artifact.content)}`;
    })
    .join("\n\n");
  const code = scanCodeSecurity(combinedText);
  const sensitiveInfo = scanForSensitiveInfo(combinedText);
  const diagnostics: ExecutionSecurityScanDiagnostic[] = [
    ...code.matches.map((match) => ({
      source: "code",
      severity: match.severity,
      type: match.type,
      description: match.description,
      context: match.context ? redactText(match.context) : undefined
    })),
    ...sensitiveInfo.matches.map((match) => ({
      source: "sensitive-info",
      severity: match.severity,
      type: match.type,
      description: match.description,
      context: redactText(match.pattern)
    }))
  ];
  const hasHighSensitiveInfo = sensitiveInfo.matches.some(
    (match) => match.severity === "high"
  );
  const blocked = shouldBlockExecution(code) || hasHighSensitiveInfo;

  return {
    blocked,
    summary: blocked
      ? `Execution security scan blocked: ${code.summary}; ${sensitiveInfo.summary}`
      : `Execution security scan passed: ${code.summary}; ${sensitiveInfo.summary}`,
    code,
    sensitiveInfo,
    diagnostics
  };
}
