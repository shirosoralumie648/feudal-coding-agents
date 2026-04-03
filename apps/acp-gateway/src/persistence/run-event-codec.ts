import type {
  GatewayRecoveryState,
  GatewayRunProjectionRecord,
  GatewayRunRecord
} from "../store";

const GATEWAY_METADATA = { actorType: "acp-gateway" } as const;
const TRACKED_DIFF_FIELDS = ["status", "awaitPrompt", "allowedActions"] as const;

type DiffField = (typeof TRACKED_DIFF_FIELDS)[number];

function hasOwnValue(
  run: GatewayRunRecord | undefined,
  field: DiffField
): run is GatewayRunRecord {
  return run !== undefined && run[field] !== undefined;
}

function isEqualValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toRecoveryState(status: GatewayRunRecord["status"]): GatewayRecoveryState {
  if (status === "awaiting" || status === "completed" || status === "failed") {
    return "healthy";
  }

  return "recovery_required";
}

function toRecoveryReason(
  status: GatewayRunRecord["status"],
  recoveryState: GatewayRecoveryState
) {
  return recoveryState === "recovery_required"
    ? `Recovered ${status} run requires operator review`
    : undefined;
}

function toRunSnapshot(run: GatewayRunRecord) {
  return {
    id: run.id,
    agent: run.agent,
    status: run.status,
    phase: run.phase,
    messages: run.messages,
    artifacts: run.artifacts,
    ...(run.awaitPrompt ? { awaitPrompt: run.awaitPrompt } : {}),
    ...(run.allowedActions ? { allowedActions: run.allowedActions } : {})
  } satisfies Record<string, unknown>;
}

function toDiffPayload(run: GatewayRunRecord, previousRun?: GatewayRunRecord) {
  const beforeSubsetJson: Record<string, unknown> = {};
  const afterSubsetJson: Record<string, unknown> = {};
  const patchJson: Array<
    { op: "add" | "replace"; path: string; value: unknown } | { op: "remove"; path: string }
  > = [];
  const changedPaths: string[] = [];

  for (const field of TRACKED_DIFF_FIELDS) {
    const beforeHasValue = hasOwnValue(previousRun, field);
    const afterHasValue = hasOwnValue(run, field);
    const beforeValue = previousRun?.[field];
    const afterValue = run[field];
    const changed =
      previousRun === undefined
        ? afterHasValue
        : beforeHasValue !== afterHasValue || !isEqualValue(beforeValue, afterValue);

    if (!changed) {
      continue;
    }

    const path = `/${field}`;
    changedPaths.push(path);

    if (beforeHasValue) {
      beforeSubsetJson[field] = beforeValue;
    }

    if (afterHasValue) {
      afterSubsetJson[field] = afterValue;
    }

    if (!beforeHasValue && afterHasValue) {
      patchJson.push({ op: "add", path, value: afterValue });
      continue;
    }

    if (beforeHasValue && !afterHasValue) {
      patchJson.push({ op: "remove", path });
      continue;
    }

    patchJson.push({ op: "replace", path, value: afterValue });
  }

  return {
    targetType: "run",
    targetId: run.id,
    beforeSubsetJson,
    afterSubsetJson,
    patchJson,
    changedPaths
  } satisfies Record<string, unknown>;
}

export function buildRunEventInputs(
  run: GatewayRunRecord,
  eventType: string,
  previousRun?: GatewayRunRecord
) {
  const runSnapshot = toRunSnapshot(run);
  const previousSnapshot = previousRun ? (toRunSnapshot(previousRun) as GatewayRunRecord) : undefined;

  return [
    {
      eventType,
      payloadJson: runSnapshot,
      metadataJson: { ...GATEWAY_METADATA }
    },
    {
      eventType: "run.diff_recorded",
      payloadJson: toDiffPayload(run, previousSnapshot),
      metadataJson: { ...GATEWAY_METADATA }
    }
  ] satisfies {
    eventType: string;
    payloadJson: Record<string, unknown>;
    metadataJson: Record<string, unknown>;
  }[];
}

export function toGatewayRunProjectionRecord(input: {
  run: GatewayRunRecord;
  latestEventId: number;
  latestProjectionVersion: number;
  lastRecoveredAt?: string;
}): GatewayRunProjectionRecord {
  const recoveryState = toRecoveryState(input.run.status);

  return {
    ...input.run,
    recoveryState,
    recoveryReason: toRecoveryReason(input.run.status, recoveryState),
    lastRecoveredAt: input.lastRecoveredAt,
    latestEventId: input.latestEventId,
    latestProjectionVersion: input.latestProjectionVersion
  };
}
