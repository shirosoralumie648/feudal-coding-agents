# Phase 2: Multi-Agent Foundation - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

构建多代理协调基础设施，包括代理通信协议、代理发现和注册服务、以及代理心跳和健康检查。本阶段专注于多代理系统的基础设施层，不涉及高级协调算法或分布式任务分配（Phase 7）。

</domain>

<decisions>
## Implementation Decisions

### 代理通信协议 (MAC-01)
- **D-01:** 使用现有的 ACP Gateway 作为通信基础设施，扩展支持代理间消息传递
- **D-02:** 消息格式采用 JSON-RPC 2.0 规范，支持请求/响应和通知模式
- **D-03:** 通信模式：同步请求（用于即时查询）、异步消息（用于任务委派）、广播通知（用于状态更新）
- **D-04:** 消息路由：直接寻址（agent-to-agent）、主题订阅（pub/sub）、能力匹配（capability-based）

### 代理发现和注册 (MAC-02)
- **D-05:** 代理注册中心基于现有 Worker Registry 扩展，支持动态注册和注销
- **D-06:** 代理元数据包括：agentId、capabilities、status、lastHeartbeat、metadata
- **D-07:** 发现机制：按能力查询、按状态过滤、按元数据匹配
- **D-08:** 注册持久化：内存缓存（快速查询）+ 事件存储（审计追踪）

### 代理心跳和健康检查 (MAC-04)
- **D-09:** 心跳间隔：默认 30 秒，可配置
- **D-10:** 健康检查：被动模式（监听心跳超时）+ 主动模式（按需探测）
- **D-11:** 故障检测：连续 3 次心跳丢失 → 标记为 unhealthy
- **D-12:** 故障转移：自动重新分配任务到健康代理（如果可用）

### Claude's Discretion
- 消息序列化的具体实现（JSON vs MessagePack）
- 心跳存储策略（内存 vs Redis）
- 消息队列的具体技术选型
- UI 组件的具体实现方式

</decisions>

<specifics>
## Specific Ideas

- "代理通信应该像 Actor 模型一样，每个代理有独立的邮箱"
- "发现服务要支持模糊匹配能力，比如 'code-*' 匹配所有代码相关代理"
- "心跳失败时要触发告警，通知操作员介入"
- "代理注册要支持临时代理（一次性任务执行后自动注销）"

</specifics>

<canonical_refs>
## Canonical References

### Agent Communication
- `apps/acp-gateway/src/workers/registry.ts` — 现有 Worker 注册实现
- `apps/acp-gateway/src/workers/types.ts` — 现有 Worker 类型定义
- `apps/acp-gateway/src/routes/agents.ts` — 现有代理路由

### Event Sourcing
- `packages/persistence/src/event-store.ts` — 事件存储实现
- `apps/acp-gateway/src/persistence/run-event-codec.ts` — 运行事件编解码

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 系统架构和限界上下文
- `.planning/codebase/CONVENTIONS.md` — 代码约定和模式

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/acp-gateway/src/workers/registry.ts` — 现有 Worker Registry，可扩展为代理注册中心
- `apps/acp-gateway/src/workers/types.ts` — 现有类型定义，可扩展支持代理元数据
- `packages/persistence/src/event-store.ts` — 事件存储，用于代理状态变更追踪
- `apps/acp-gateway/src/routes/agents.ts` — 现有代理 API，可扩展发现和查询

### Established Patterns
- **Worker Registry Pattern** — 现有注册模式，代理注册应遵循相同模式
- **Event Sourcing Pattern** — 所有状态变更通过事件记录
- **Fastify Routes Pattern** — API 路由遵循现有约定

### Integration Points
- **ACP Gateway** — 代理通信需与现有 ACP Gateway 集成
- **Worker Runner** — 代理执行需与现有 Worker Runner 集成
- **Event Store** — 代理状态变更需持久化到事件存储

</code_context>

<deferred>
## Deferred Ideas

- **分布式任务分配算法** — 智能任务调度和负载均衡（Phase 7）
- **代理集群管理** — 大规模代理集群的协调（Phase 7）
- **代理间协商协议** — 复杂的多轮协商和投票机制（Phase 7）
- **基于机器学习的代理匹配** — 根据历史数据优化代理选择（未来增强）

</deferred>

---

*Phase: 02-multi-agent-foundation*
*Context gathered: 2026-04-27*
