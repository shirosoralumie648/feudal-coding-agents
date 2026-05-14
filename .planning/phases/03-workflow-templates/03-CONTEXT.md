# Phase 3: Workflow Templates - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

实现可重用工作流模板系统。用户通过 JSON 定义工作流模板（代码优先，符合 PROJECT.md 排除可视化设计器的决策），模板支持参数化、版本控制，并可在不同项目间共享。不涉及可视化设计器（out of scope）、模板市场（WFT-03，未来阶段）。
</domain>

<decisions>
## Implementation Decisions

### 模板定义格式
- **D-01:** 使用 JSON-based DSL 定义模板结构，与现有 orchestrator-types.ts 类型体系一致
- **D-02:** 模板核心元素：name, version (semver), parameters, steps[] (每个 step: id, type, agent, dependsOn[], conditions, config)
- **D-03:** 支持的步骤类型：intake, planning, review, approval, execution, verification — 映射现有 orchestrator-flows.ts 的阶段
- **D-04:** 条件分支：支持基于前置步骤输出的简单条件 (output.status === "approved" → next step)，不实现完整编程语言

### 模板参数化
- **D-05:** 参数 schema 使用 JSON Schema 子集定义（与项目已有的 Zod 验证模式一致）
- **D-06:** 每个参数包含：name, type (string | number | boolean | enum), default, required, description
- **D-07:** 模板实例化时传入 parameters 对象，运行时验证并注入到各 step 的 config 中
- **D-08:** 参数引用语法：`${params.paramName}` 在步骤配置中插值

### 模板与现有编排器集成
- **D-09:** 模板作为配置层叠加在 orchestrator-flows.ts 之上，不替换现有硬编码逻辑
- **D-10:** 新建 `WorkflowTemplateEngine` 服务，读取模板定义并动态编排步骤执行
- **D-11:** 现有硬编码流程（intake → planning → review → approval → execution → verification）作为内置 "default" 模板保留
- **D-12:** 模板执行复用现有 task-coordinator、governance-coordinator、operator-coordinator

### 模板版本控制与存储
- **D-13:** 版本控制沿用 Phase 1 D-03 模式：乐观锁 + draft/published 状态
- **D-14:** 模板存储：事件存储（版本历史 + 审计追踪）+ 内存缓存（快速读取）
- **D-15:** 跨项目共享：模板导出为 JSON 文件，通过文件系统或 Git 共享（不实现远程注册表）
- **D-16:** 版本号遵循 semver，breaking change 需主版本号递增

### Claude's Discretion
- 模板 JSON Schema 的具体字段设计
- 条件表达式的具体语法（在简单条件约束内）
- 模板执行引擎的错误处理和重试策略
- API 端点的具体路由设计
</decisions>

<specifics>
## Specific Ideas

- "模板应该像 GitHub Actions workflow 一样直观" — Phase 1 中的反馈，JSON 结构参考 GitHub Actions 的 jobs/steps 模型
- 模板应能完整描述一个 feudal 编程工作流的所有阶段，让非开发人员也能理解流程
- 模板实例化后应生成可追踪的执行记录

</specifics>

<canonical_refs>
## Canonical References

### Workflow & Orchestration
- `apps/control-plane/src/services/orchestrator-flows.ts` — 当前硬编码的工作流逻辑，模板需覆盖的所有步骤类型
- `apps/control-plane/src/services/orchestrator-types.ts` — 现有编排类型定义，模板类型体系的基础
- `apps/control-plane/src/services/orchestrator-service.ts` — 编排服务外观，模板引擎的集成点
- `apps/control-plane/src/services/task-coordinator.ts` — 任务协调器，模板执行的核心依赖

### Governance & Versioning (Phase 1 patterns)
- `apps/control-plane/src/governance/policy.ts` — Phase 1 的版本控制模式（乐观锁 + 草稿/发布）
- `.planning/phases/01-governance-enhancement/01-CONTEXT.md` — D-03 乐观锁版本控制决策

### Agent Infrastructure (Phase 2)
- `apps/acp-gateway/src/agent-registry/registry.ts` — 代理注册中心，模板步骤的 agent 引用目标
- `apps/acp-gateway/src/agent-registry/discovery.ts` — 代理发现服务，按 capability 匹配模板步骤到具体代理

### Event Sourcing
- `packages/persistence/src/event-store.ts` — 事件存储，模板版本历史的持久化层
- `apps/control-plane/src/persistence/task-event-codec.ts` — 事件编解码模式参考

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 系统架构和限界上下文
- `.planning/codebase/CONVENTIONS.md` — 代码约定
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/control-plane/src/services/orchestrator-flows.ts` — 完整的步骤编排逻辑，可直接适配为模板执行引擎
- `apps/control-plane/src/services/orchestrator-types.ts` — 类型定义可直接扩展支持模板结构
- `apps/acp-gateway/src/agent-registry/registry.ts` — 代理注册中心，模板步骤引用代理时查询
- `packages/persistence/src/event-store.ts` — 事件存储，模板版本历史的基础设施
- `apps/control-plane/src/governance/policy.ts` — 版本控制和审批模式可复用

### Established Patterns
- **Event Sourcing** — 模板变更通过事件记录，版本历史和审计天然支持
- **Zod Validation** — 所有输入验证使用 Zod，模板 schema 验证应遵循
- **Fastify Routes** — API 端点遵循现有路由模式
- **Optimistic Locking** — Phase 1 的版本控制模式，模板版本沿用

### Integration Points
- **Orchestrator Service** — 模板引擎集成到 `orchestrator-service.ts`，作为新的执行路径
- **Task Coordinator** — 模板步骤的执行委托给 task-coordinator
- **Governance Coordinator** — 审批步骤复用 governance-coordinator
- **Agent Registry** — 模板中引用的 agent 通过 registry 解析
- **Event Store** — 模板定义和实例化记录持久化
</code_context>

<deferred>
## Deferred Ideas

- **可视化工作流设计器** — PROJECT.md 明确排除，代码优先
- **模板市场 (WFT-03)** — 跨组织的模板分享和发现平台，未来阶段
- **模板执行可视化** — 实时展示模板执行进度和步骤状态，可纳入 Phase 4 (Analytics)
- **模板导入/导出 UI** — 当前通过文件系统共享，UI 管理界面延后
- **条件表达式 DSL 增强** — 目前只支持简单条件，复杂的脚本化条件延后

</deferred>

---

*Phase: 03-workflow-templates*
*Context gathered: 2026-04-29*
