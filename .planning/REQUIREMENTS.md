# Requirements

**Generated:** 2026-04-27
**Traceability:** See ROADMAP.md for phase mappings
**Archive status:** v1.0 was archived on 2026-05-14. Treat this file as historical until `$gsd-new-milestone` generates fresh v1.1 requirements.

---

## v1 Requirements

### Governance & Policy (GOV)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| GOV-01 | 复杂的条件审批规则引擎 | High | Active | TBD |
| GOV-02 | 基于角色的细粒度权限控制 | High | Active | TBD |
| GOV-03 | 审批链和工作流模板 | Medium | Active | TBD |
| GOV-04 | 自动审批规则（基于复杂度评分） | Medium | Active | TBD |

### Multi-Agent Coordination (MAC)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| MAC-01 | 多代理通信协议 | High | Active | TBD |
| MAC-02 | 代理发现和注册服务 | High | Active | TBD |
| MAC-03 | 分布式任务分配 | Medium | Active | TBD |
| MAC-04 | 代理心跳和健康检查 | Medium | Active | TBD |

### Workflow & Templates (WFT)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| WFT-01 | 可重用的工作流模板系统 | High | Active | TBD |
| WFT-02 | 可视化工作流定义（代码优先） | Medium | Active | TBD |
| WFT-03 | 模板市场和版本控制 | Low | Active | TBD |

### Analytics & Monitoring (ANM)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| ANM-01 | 高级分析和仪表板 | High | Active | TBD |
| ANM-02 | 实时指标收集和警报 | High | Active | TBD |
| ANM-03 | 性能瓶颈分析 | Medium | Active | TBD |
| ANM-04 | 审计追踪可视化 | Medium | Active | TBD |

### Plugin System (PLG)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| PLG-01 | 插件扩展系统架构 | Medium | Active | TBD |
| PLG-02 | 插件注册和生命周期管理 | Medium | Active | TBD |
| PLG-03 | 插件 API 和 SDK | Low | Active | TBD |

### Performance & Security (PSC)

| ID | Requirement | Priority | Status | Phase |
|----|-------------|----------|--------|-------|
| PSC-01 | 性能优化和缓存策略 | High | Active | TBD |
| PSC-02 | 增强的安全控制和访问管理 | High | Active | TBD |
| PSC-03 | 数据库查询优化（N+1 问题） | High | Active | TBD |
| PSC-04 | 输入验证和安全扫描 | Medium | Active | TBD |

---

## Validated (Existing)

### Task Management (TSK)
- ✓ **TSK-01**: 完整的任务状态机 (draft → intake → planning → review → approval → execution → verification) — existing
- ✓ **TSK-02**: 任务生命周期管理 — existing
- ✓ **TSK-03**: 任务泳道可视化 — existing

### Governance & Policy (GOV)
- ✓ **GOV-01**: 治理策略和审批工作流 — existing
- ✓ **GOV-02**: 复杂度评分系统 — existing
- ✓ **GOV-03**: 审核和批准工作流 — existing

### Operator Actions (OPS)
- ✓ **OPS-01**: 操作员恢复操作 — existing
- ✓ **OPS-02**: 操作员接管操作 — existing
- ✓ **OPS-03**: 操作员放弃操作 — existing
- ✓ **OPS-04**: 操作员控制台界面 — existing

### Event Sourcing (EVT)
- ✓ **EVT-01**: 事件存储架构 — existing
- ✓ **EVT-02**: 投影重建机制 — existing
- ✓ **EVT-03**: 事件回放和审计 — existing
- ✓ **EVT-04**: 任务事件编解码器 — existing
- ✓ **EVT-05**: 运行事件编解码器 — existing

### ACP Gateway (ACP)
- ✓ **ACP-01**: 代理通信协议网关 — existing
- ✓ **ACP-02**: Agent Manifest 注册 — existing
- ✓ **ACP-03**: 运行生命周期管理 — existing
- ✓ **ACP-04**: 工件持久化 — existing
- ✓ **ACP-05**: Codex CLI 集成 — existing

### Worker/Agent Execution (WRK)
- ✓ **WRK-01**: Worker 定义和注册 — existing
- ✓ **WRK-02**: Agent Prompt 执行引擎 — existing
- ✓ **WRK-03**: JSON Schema 输出验证 — existing
- ✓ **WRK-04**: Prompt 模板系统 — existing

### Web Interface (WEB)
- ✓ **WEB-01**: 操作员控制台 — existing
- ✓ **WEB-02**: 治理收件箱界面 — existing
- ✓ **WEB-03**: 任务监控仪表板 — existing
- ✓ **WEB-04**: 恢复操作界面 — existing

### Metrics & Monitoring (MTM)
- ✓ **MTM-01**: 指标收集接口 — existing
- ✓ **MTM-02**: 基础监控能力 — existing

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| 通用工作流引擎 | 专注于 AI 编程工作流，不扩展到通用工作流 |
| 多租户 SaaS 架构 | 当前版本专注于单租户部署 |
| 可视化工作流设计器 | 优先通过代码定义工作流，可视化设计器延后 |
| 自然语言编程 | 当前专注于结构化工作流定义 |
| 实时代码协作 | 超出当前范围，专注于异步工作流 |
| 移动应用支持 | Web 界面优先，移动应用不在当前计划中 |

---

## Traceability Matrix

See ROADMAP.md for phase mappings and detailed traceability information.
