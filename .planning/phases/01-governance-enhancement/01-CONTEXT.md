# Phase 1: Governance Enhancement - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

实现复杂的条件审批规则引擎，包括基于角色的细粒度权限控制（RBAC）、条件审批规则和自动审批规则（基于复杂度评分）。本阶段专注于治理系统的增强，不涉及多代理协调或工作流模板。

</domain>

<decisions>
## Implementation Decisions

### 条件审批规则引擎
- **D-01:** 使用规则表达式语言（JSON-based DSL）定义审批条件，支持 AND/OR/NOT 逻辑组合
- **D-02:** 规则评估引擎采用同步执行模式（< 100ms），规则复杂度过高时降级为异步
- **D-03:** 规则版本控制采用乐观锁机制，编辑时创建草稿版本，发布时验证规则完整性

### RBAC 权限系统
- **D-04:** 权限模型采用 RBAC0 + RBAC1（角色层级），支持角色继承
- **D-05:** 权限检查粒度：API 端点级别 + 数据字段级别（通过 middleware + decorator 实现）
- **D-06:** 角色定义存储在数据库，支持运行时动态配置（不需要重启服务）
- **D-07:** 默认角色：admin, operator, viewer, auditor（审计员只读角色）

### 自动审批规则
- **D-08:** 自动审批触发条件：复杂度评分 < 阈值（可配置，默认 30）
- **D-09:** 复杂度评分算法：基于代码变更行数、文件数、依赖关系深度的加权公式
- **D-10:** 自动审批记录完整审计日志，标记为 "auto-approved" 类型

### 审计和历史追踪
- **D-11:** 所有规则变更、权限变更、审批决策记录到事件存储（event store）
- **D-12:** 历史版本支持时间点查询（point-in-time query），可查看任意时刻的规则状态

### Claude's Discretion
- 规则表达式的具体语法设计（在 DSL 范围内灵活）
- 角色权限缓存策略（Redis vs 内存）
- 复杂度评分的具体权重系数
- UI 组件的具体实现方式

</decisions>

<specifics>
## Specific Ideas

- "我希望规则引擎能像 GitHub Actions 的 workflow 语法一样直观"
- "权限系统要支持临时授权（time-bound access），比如临时给某人 2 小时的审批权限"
- "复杂度评分可以参考 SonarQube 的复杂度计算方式"
- "审计日志要符合 SOC 2 合规要求，不可篡改"

</specifics>

<canonical_refs>
## Canonical References

### Governance & Policy
- `.planning/codebase/ARCHITECTURE.md` — 现有治理系统架构和限界上下文
- `.planning/codebase/CONCERNS.md` — 已知技术债务和安全风险
- `apps/control-plane/src/governance/policy.ts` — 现有治理策略实现
- `apps/control-plane/src/governance/complexity-scorer.ts` — 现有复杂度评分实现

### RBAC & Permissions
- `apps/control-plane/src/operator-actions/policy.ts` — 操作员权限策略

### Event Sourcing
- `packages/persistence/src/event-store.ts` — 事件存储实现
- `apps/control-plane/src/persistence/task-event-codec.ts` — 任务事件编解码

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/contracts/src/index.ts` — 共享类型定义，可用于规则引擎类型
- `apps/control-plane/src/governance/complexity-scorer.ts` — 现有复杂度评分逻辑，可扩展用于自动审批
- `packages/persistence/src/event-store.ts` — 事件存储，用于审计日志

### Established Patterns
- **Event Sourcing Pattern** — 所有状态变更通过事件记录，审计追踪天然支持
- **Policy Pattern** — 治理策略使用策略模式，新规则引擎应遵循相同模式
- **CQRS** — 读写分离，规则评估（读）和规则管理（写）可分离优化

### Integration Points
- **Control Plane API** — 新 RBAC 权限检查需集成到现有路由 (`apps/control-plane/src/routes/`)
- **Governance Inbox** — 审批规则引擎需与现有治理收件箱 (`useTaskConsole`) 集成
- **Event Store** — 所有规则变更需持久化到现有事件存储

</code_context>

<deferred>
## Deferred Ideas

- **多代理协调的权限同步** — 当代理执行需要权限时，RBAC 如何与代理身份集成（Phase 2）
- **工作流模板的权限继承** — 模板创建者权限如何传递给模板使用者（Phase 3）
- **细粒度的字段级权限** — 数据字段级别的权限控制（超出 Phase 1 范围，当前为 API 端点级别）
- **基于机器学习的审批推荐** — 基于历史审批数据训练推荐模型（未来增强）

</deferred>

---

*Phase: 01-governance-enhancement*
*Context gathered: 2026-04-27*
