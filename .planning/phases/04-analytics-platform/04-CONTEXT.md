# Phase 4: Analytics Platform - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

构建高级分析和仪表板系统，包括实时指标收集与警报、审计追踪可视化。扩展现有基础 /metrics 端点，添加 SSE 实时推送、可配置警报规则和 webhook 通知。前端新增 Analytics Dashboard 页面。不涉及机器学习预测分析或外部 BI 工具集成。
</domain>

<decisions>
## Implementation Decisions

### 仪表板架构
- **D-01:** 扩展 control-plane 现有 /metrics 端点，新增 /analytics/* 端点族，不创建独立服务
- **D-02:** 前端图表库使用 recharts（轻量、React-native、与现有技术栈一致）
- **D-03:** 仪表板页面：AnalyticsDashboard 组件，嵌入现有 web app.tsx 路由
- **D-04:** 数据聚合层：AnalyticsService，从 task-read-model 和 event store 投影计算指标

### 实时指标收集
- **D-05:** 拉模式（pull）：AnalyticsService 定时轮询 task-read-model（默认 10s 间隔）
- **D-06:** 实时推送：SSE 端点 `/analytics/stream` 推送指标更新到前端
- **D-07:** 指标存储：内存缓存 + 定期快照到事件存储（事件溯源模式）
- **D-08:** 指标维度：任务吞吐量、代理利用率、审批延迟、错误率、token 消耗

### 审计追踪可视化
- **D-09:** 事件时间线视图为主，表格视图为辅
- **D-10:** 过滤维度：taskId、agentId、eventType、时间范围
- **D-11:** 复用现有 event store 和 replay 基础设施，新增 `/analytics/audit-trail` 查询端点
- **D-12:** 支持关键字搜索事件内容（全文搜索内存索引）

### 警报规则与通知
- **D-13:** 警报规则：JSON 配置文件定义阈值（任务积压数、代理离线时长、审批超时）
- **D-14:** 通知渠道：in-app（web console 顶部通知栏）+ webhook（Slack/Discord 兼容格式）
- **D-15:** 告警抑制：相同规则 5 分钟内不重复触发，已恢复自动清除
- **D-16:** AlertService：独立服务类，订阅 AnalyticsService 指标变更事件

### Claude's Discretion
- recharts 的具体图表类型选择和配色方案
- SSE 重连策略和心跳间隔
- 警报规则配置文件的精确 JSON schema
- 审计追踪时间线的 UI 细节
</decisions>

<specifics>
## Specific Ideas

- 仪表板应该像 Grafana 的简洁版 — 一目了然的关键指标，可下钻查看细节
- 审计追踪要能看到"谁在什么时候做了什么"，支持导出为 CSV
- 警报不要过于嘈杂 — 宁可少报也不要误报
</specifics>

<canonical_refs>
## Canonical References

### Existing Metrics
- `apps/control-plane/src/routes/metrics.ts` — 现有基础指标端点（task/run 计数、健康检查）
- `apps/control-plane/src/persistence/task-read-model.ts` — 任务读取模型，指标数据源

### Event Sourcing & Audit
- `packages/persistence/src/event-store.ts` — 事件存储，审计追踪数据源
- `apps/control-plane/src/persistence/task-event-codec.ts` — 事件编解码
- `apps/control-plane/src/routes/replay.ts` — 事件回放端点

### Agent Infrastructure
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts` — 心跳监控，实时监控参考模式

### Web Console
- `apps/web/src/app.tsx` — 现有 web 应用入口，新仪表板集成点
- `apps/web/src/components/task-list.tsx` — 现有任务列表，仪表板设计参考

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 系统架构
- `.planning/codebase/STACK.md` — 技术栈
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/control-plane/src/routes/metrics.ts` — 基础 /metrics 端点，可直接扩展
- `apps/control-plane/src/persistence/task-read-model.ts` — 丰富的投影数据可供分析
- `apps/acp-gateway/src/agent-health/heartbeat-monitor.ts` — 定时监控模式可复用于指标采集
- `apps/web/src/hooks/` — 现有 React hooks 模式，SSE hook 可遵循

### Established Patterns
- **Fastify Routes** — 新 /analytics/* 端点遵循现有模式
- **Event Sourcing** — 指标快照通过事件存储持久化
- **React Components** — 仪表板组件遵循现有组件模式

### Integration Points
- **Control Plane API** — 新 analytics 端点集成到 server.ts
- **Web App** — AnalyticsDashboard 集成到 app.tsx 路由
- **Event Store** — 审计追踪查询复用现有基础设施
- **Agent Health** — 警报规则可引用心跳监控数据
</code_context>

<deferred>
## Deferred Ideas

- **机器学习预测分析** — 基于历史数据预测任务耗时和失败概率
- **外部 BI 工具集成** — Grafana/GSheet 数据源导出
- **自定义仪表板构建器** — 拖拽式仪表板定制
- **多租户分析隔离** — 按项目/团队分离分析数据
</deferred>

---

*Phase: 04-analytics-platform*
*Context gathered: 2026-04-29*
