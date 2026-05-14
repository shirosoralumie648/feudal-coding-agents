import type { AgentRegistry } from "../agent-registry/registry";
import type {
  AgentJsonRpcEnvelope,
  AgentMessage,
  AgentNotification,
  BroadcastResult,
  DeliveryResult,
  SendResult
} from "./types";
import { createJsonRpcNotification } from "./json-rpc";

export interface MessageRouterAuditStore {
  append(entry: {
    messageId: string;
    route: "direct" | "broadcast" | "capability";
    from: string;
    targets: string[];
    delivered: boolean;
    timestamp: string;
  }): Promise<void>;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function toDeliveryFailure(agentId: string, error: string): DeliveryResult {
  return {
    agentId,
    delivered: false,
    error
  };
}

export class AgentMessageRouter {
  private readonly mailboxes = new Map<string, AgentJsonRpcEnvelope[]>();

  constructor(
    private readonly options: {
      registry: AgentRegistry;
      auditStore?: MessageRouterAuditStore;
    }
  ) {}

  routeByCapability(capability: string | RegExp): string[] {
    const matcher = typeof capability === "string" ? globToRegex(capability) : capability;

    return this.options.registry
      .listAgents()
      .filter((agent) => agent.capabilities.some((value) => matcher.test(value)))
      .map((agent) => agent.agentId);
  }

  async send(message: AgentMessage): Promise<SendResult> {
    const targets = Array.isArray(message.to) ? message.to : [message.to];
    const deliveries = await Promise.all(
      targets.map(async (agentId) => this.deliver(agentId, message))
    );

    await this.options.auditStore?.append({
      messageId: message.id,
      route: "direct",
      from: message.from,
      targets,
      delivered: deliveries.every((delivery) => delivery.delivered),
      timestamp: new Date().toISOString()
    });

    return {
      messageId: message.id,
      delivered: deliveries.every((delivery) => delivery.delivered),
      deliveries
    };
  }

  async broadcast(input: {
    method: string;
    params?: Record<string, unknown>;
    from: string;
  }): Promise<BroadcastResult> {
    const message = createJsonRpcNotification({
      method: input.method,
      params: input.params,
      from: input.from,
      to: this.options.registry
        .listAgents()
        .map((agent) => agent.agentId)
        .filter((agentId) => agentId !== input.from)
    });
    const targets = Array.isArray(message.to) ? message.to : [message.to];
    const deliveries = await Promise.all(targets.map(async (agentId) => this.deliver(agentId, message)));

    const deliveredTo = deliveries
      .filter((delivery) => delivery.delivered)
      .map((delivery) => delivery.agentId);
    const failed = deliveries.filter((delivery) => !delivery.delivered);

    await this.options.auditStore?.append({
      messageId: `${message.from}:${message.method}:${message.timestamp.toISOString()}`,
      route: "broadcast",
      from: message.from,
      targets,
      delivered: failed.length === 0,
      timestamp: new Date().toISOString()
    });

    return {
      messageId: `${message.from}:${message.method}:${message.timestamp.toISOString()}`,
      deliveredTo,
      failed
    };
  }

  async sendByCapability(input: {
    capability: string | RegExp;
    method: string;
    params?: Record<string, unknown>;
    from: string;
  }): Promise<BroadcastResult> {
    const targets = this.routeByCapability(input.capability).filter(
      (agentId) => agentId !== input.from
    );
    const message = createJsonRpcNotification({
      method: input.method,
      params: input.params,
      from: input.from,
      to: targets
    });
    const deliveries = await Promise.all(targets.map(async (agentId) => this.deliver(agentId, message)));
    const deliveredTo = deliveries
      .filter((delivery) => delivery.delivered)
      .map((delivery) => delivery.agentId);
    const failed = deliveries.filter((delivery) => !delivery.delivered);

    await this.options.auditStore?.append({
      messageId: `${message.from}:${message.method}:${message.timestamp.toISOString()}`,
      route: "capability",
      from: message.from,
      targets,
      delivered: failed.length === 0,
      timestamp: new Date().toISOString()
    });

    return {
      messageId: `${message.from}:${message.method}:${message.timestamp.toISOString()}`,
      deliveredTo,
      failed
    };
  }

  getPendingMessages(agentId: string, sinceMessageId?: string): AgentJsonRpcEnvelope[] {
    const mailbox = this.mailboxes.get(agentId) ?? [];
    if (!sinceMessageId) {
      return [...mailbox];
    }

    const index = mailbox.findIndex(
      (message) => "id" in message && message.id === sinceMessageId
    );

    if (index === -1) {
      return [...mailbox];
    }

    return mailbox.slice(index + 1);
  }

  private async deliver(
    agentId: string,
    message: AgentMessage | AgentNotification
  ): Promise<DeliveryResult> {
    const target = this.options.registry.getAgent(agentId);
    if (!target) {
      return toDeliveryFailure(agentId, `Unknown target agent "${agentId}"`);
    }

    const mailbox = this.mailboxes.get(agentId) ?? [];
    mailbox.push(message);
    this.mailboxes.set(agentId, mailbox);

    return {
      agentId,
      delivered: true
    };
  }
}
