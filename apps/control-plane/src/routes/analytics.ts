import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  AnalyticEvent,
  AuditEvent,
  AuditTrailEntry,
  AuditTrailQuery
} from "@feudal/contracts";
import { AuditTrailQuerySchema } from "@feudal/contracts";
import type { AnalyticsService } from "../services/analytics-service";

const SEARCH_INDEX_CAP = 50000;

type AnalyticsQuery = Record<string, unknown>;

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return Number(value);
}

function normalizeQuery(rawQuery: unknown): AuditTrailQuery {
  const query = (rawQuery ?? {}) as AnalyticsQuery;
  const timeStart = query["timeRange[start]"];
  const timeEnd = query["timeRange[end]"];
  const timeRange =
    typeof timeStart === "string" || typeof timeEnd === "string"
      ? {
          start: String(timeStart ?? ""),
          end: String(timeEnd ?? "")
        }
      : query.timeRange;

  return AuditTrailQuerySchema.parse({
    taskId: query.taskId,
    agentId: query.agentId,
    eventType: query.eventType,
    timeRange,
    searchQuery: query.searchQuery,
    limit: toOptionalNumber(query.limit),
    cursor: toOptionalNumber(query.cursor)
  });
}

function payloadText(event: AuditEvent) {
  return JSON.stringify(event.payloadJson ?? {});
}

function payloadSummary(event: AuditEvent) {
  return payloadText(event).slice(0, 200);
}

function toMetadata(event: AuditEvent) {
  const metadata =
    event.metadataJson && typeof event.metadataJson === "object"
      ? event.metadataJson
      : {};

  return metadata as Record<string, unknown>;
}

function toAuditTrailEntry(event: AuditEvent): AuditTrailEntry {
  const metadata = toMetadata(event);

  return {
    eventId: event.id,
    streamType: event.streamType,
    streamId: event.streamId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    payloadSummary: payloadSummary(event),
    actorType: typeof metadata.actorType === "string" ? metadata.actorType : null,
    actorId: typeof metadata.actorId === "string" ? metadata.actorId : null
  };
}

function isWithinTimeRange(event: AuditEvent, query: AuditTrailQuery) {
  if (!query.timeRange) {
    return true;
  }

  const occurredAt = new Date(event.occurredAt).getTime();
  const start = new Date(query.timeRange.start).getTime();
  const end = new Date(query.timeRange.end).getTime();

  return occurredAt >= start && occurredAt <= end;
}

function writeSnapshot(reply: FastifyReply, event: AnalyticEvent) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: {
    analyticsService: AnalyticsService;
  }
) {
  const searchIndex = new Map<number, string>();

  function indexEvents(events: AuditEvent[]) {
    for (const event of events) {
      if (!searchIndex.has(event.id)) {
        searchIndex.set(event.id, payloadText(event).toLowerCase());
      }

      while (searchIndex.size > SEARCH_INDEX_CAP) {
        const oldest = searchIndex.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        searchIndex.delete(oldest);
      }
    }
  }

  function eventMatches(event: AuditEvent, query: AuditTrailQuery) {
    const metadata = toMetadata(event);

    if (query.taskId && event.streamId !== query.taskId) {
      return false;
    }

    if (query.agentId && metadata.agentId !== query.agentId) {
      return false;
    }

    if (query.eventType && event.eventType !== query.eventType) {
      return false;
    }

    if (!isWithinTimeRange(event, query)) {
      return false;
    }

    if (query.searchQuery) {
      const indexed = searchIndex.get(event.id) ?? "";
      return indexed.includes(query.searchQuery.toLowerCase());
    }

    return true;
  }

  async function snapshotHandler(_request: FastifyRequest, reply: FastifyReply) {
    const snapshot = options.analyticsService.getLatestSnapshot();

    if (!snapshot) {
      return reply.code(503).send({
        status: "no_data",
        message: "No metrics snapshot available yet"
      });
    }

    return snapshot;
  }

  async function streamHandler(request: FastifyRequest, reply: FastifyReply) {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const unsubscribe = options.analyticsService.subscribe({
      onMetricSnapshot(snapshot) {
        writeSnapshot(reply, { type: "snapshot", payload: snapshot });
      }
    });
    const latest = options.analyticsService.getLatestSnapshot();
    const heartbeatId = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    if (latest) {
      writeSnapshot(reply, { type: "snapshot", payload: latest });
    }

    request.raw.on("close", () => {
      unsubscribe();
      clearInterval(heartbeatId);
    });
  }

  async function auditTrailHandler(request: FastifyRequest, reply: FastifyReply) {
    let query: AuditTrailQuery;

    try {
      query = normalizeQuery(request.query);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? z.prettifyError(error)
          : "Invalid analytics query";
      return reply.code(400).send({ message });
    }

    const events = await options.analyticsService.loadAuditEvents(query.cursor ?? 0);
    indexEvents(events);

    const filtered = events.filter((event) => eventMatches(event, query));
    const entries = filtered.slice(0, query.limit).map(toAuditTrailEntry);
    const nextCursor =
      filtered.length > entries.length ? entries.at(-1)?.eventId : undefined;

    return {
      entries,
      nextCursor,
      totalCount: filtered.length
    };
  }

  for (const prefix of ["/analytics", "/api/analytics"]) {
    app.get(`${prefix}/snapshot`, snapshotHandler);
    app.get(`${prefix}/stream`, streamHandler);
    app.get(`${prefix}/audit-trail`, auditTrailHandler);
  }
}

