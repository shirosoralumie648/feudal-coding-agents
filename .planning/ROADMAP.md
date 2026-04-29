# Roadmap

**Project:** Feudal Coding Agents  
**Generated:** 2026-04-27  
**Phases:** 8  
**Requirements:** 36 Active -> 8 Phases

---

## Phase Summary

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Governance Enhancement | 实现复杂的条件审批规则引擎 | GOV-01, GOV-02, GOV-04 | 3 |
| 2 | Multi-Agent Foundation | 构建多代理协调基础设施 | MAC-01, MAC-02, MAC-04 | 3 |
| 3 | Workflow Templates | 实现可重用工作流模板系统 | WFT-01, WFT-02 | 2 |
| 4 | Analytics Platform | 构建高级分析和仪表板 | ANM-01, ANM-02, ANM-04 | 3 |
| 5 | Plugin Architecture | 实现插件扩展系统 | PLG-01, PLG-02 | 2 |
| 6 | Performance Optimization | 性能优化和安全增强 | PSC-01, PSC-03, PSC-04 | 3 |
| 7 | Advanced Multi-Agent | 高级多代理协调功能 | MAC-03, ANM-03 | 2 |
| 8 | Plugin Ecosystem | 插件市场和生态系统 | PLG-03, PSC-02 | 2 |

---

## Phase Details

### Phase 1: Governance Enhancement

**Goal:** 实现复杂的条件审批规则引擎

**Requirements:**
- GOV-01: 复杂的条件审批规则引擎 (Priority: High)
- GOV-02: 基于角色的细粒度权限控制 (Priority: High)
- GOV-04: 自动审批规则（基于复杂度评分） (Priority: Medium)

**Success Criteria:**
1. 用户可以通过 UI 配置条件审批规则
2. 支持基于复杂度评分的自动审批/拒绝
3. 角色权限系统支持自定义角色和权限
4. 审批历史可追踪和审计
5. 规则变更支持版本控制

**Dependencies:** None

---

### Phase 2: Multi-Agent Foundation

**Goal:** 构建多代理协调基础设施

**Requirements:**
- MAC-01: 多代理通信协议 (Priority: High)
- MAC-02: 代理发现和注册服务 (Priority: High)
- MAC-04: 代理心跳和健康检查 (Priority: Medium)

**Success Criteria:**
1. 代理可以通过标准化的协议进行通信
2. 代理注册中心支持动态注册和发现
3. 支持代理心跳检测和自动故障转移
4. 代理状态可以实时监控
5. 支持代理负载均衡

**Dependencies:** None

**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md -- Agent communication protocol (JSON-RPC 2.0 messaging)
- [ ] 02-02-PLAN.md -- Agent discovery and registration service
- [ ] 02-03-PLAN.md -- Heartbeat monitoring and automatic failover

---

### Phase 3: Workflow Templates

**Goal:** 实现可重用工作流模板系统

**Requirements:**
- WFT-01: 可重用的工作流模板系统 (Priority: High)
- WFT-02: 可视化工作流定义（代码优先） (Priority: Medium)

**Success Criteria:**
1. 用户可以创建和保存工作流模板
2. 模板支持参数化和配置
3. 工作流可以通过代码定义（YAML/JSON）
4. 支持模板版本控制
5. 模板可以在不同项目间共享

**Dependencies:** None

**Plans:** 4 plans

Plans:
- [ ] 03-01-PLAN.md -- Template type definitions, Zod schemas, and parameter interpolation
- [ ] 03-02-PLAN.md -- WorkflowTemplateEngine: dependency resolution, condition evaluation, step dispatch
- [ ] 03-03-PLAN.md -- TemplateStore: event-sourced CRUD, versioning, export/import
- [ ] 03-04-PLAN.md -- API routes (CRUD + instantiation) and config/server integration

---

### Phase 4: Analytics Platform

**Goal:** 构建高级分析和仪表板

**Requirements:**
- ANM-01: 高级分析和仪表板 (Priority: High)
- ANM-02: 实时指标收集和警报 (Priority: High)
- ANM-04: 审计追踪可视化 (Priority: Medium)

**Success Criteria:**
1. 提供高级分析和可视化仪表板
2. 支持实时指标收集和警报
3. 审计追踪可以可视化查看
4. 支持自定义仪表板和报表
5. 支持数据导出和集成

**Dependencies:** None

**Plans:** 5 plans

Plans:
- [ ] 04-01-PLAN.md -- Analytics contract types (Zod schemas, MetricEventEmitter/MetricListener interfaces)
- [ ] 04-02-PLAN.md -- AnalyticsService pull-mode engine and /analytics/* API routes (snapshot, SSE, audit trail)
- [ ] 04-03-PLAN.md -- AlertService with JSON rules, suppression, in-app + webhook notifications
- [ ] 04-04-PLAN.md -- AnalyticsDashboard frontend with recharts (metric cards, line/bar/pie charts, SSE hook)
- [ ] 04-05-PLAN.md -- AuditTrailViewer (timeline/table, filters, search) + AlertPanel + app.tsx integration

---

### Phase 5: Plugin Architecture

**Goal:** 实现插件扩展系统

**Requirements:**
- PLG-01: 插件扩展系统架构 (Priority: Medium)
- PLG-02: 插件注册和生命周期管理 (Priority: Medium)

**Success Criteria:**
1. 提供插件扩展系统架构
2. 支持插件注册和生命周期管理
3. 插件 API 设计清晰
4. 支持插件热加载和卸载
5. 提供插件开发 SDK

**Dependencies:** None

---

### Phase 6: Performance Optimization

**Goal:** 性能优化和安全增强

**Requirements:**
- PSC-01: 性能优化和缓存策略 (Priority: High)
- PSC-03: 数据库查询优化（N+1 问题） (Priority: High)
- PSC-04: 输入验证和安全扫描 (Priority: Medium)

**Success Criteria:**
1. 实现性能优化和缓存策略
2. 数据库查询优化（解决 N+1 问题）
3. 输入验证和安全扫描
4. 性能指标达到目标（响应时间 < 200ms）
5. 安全漏洞扫描通过

**Dependencies:** None

---

### Phase 7: Advanced Multi-Agent

**Goal:** 高级多代理协调功能

**Requirements:**
- MAC-03: 分布式任务分配 (Priority: Medium)
- ANM-03: 性能瓶颈分析 (Priority: Medium)

**Success Criteria:**
1. 分布式任务分配
2. 性能瓶颈分析
3. 支持大规模代理集群
4. 智能任务调度和负载均衡
5. 支持代理故障自动恢复

**Dependencies:** Phase 2 (Multi-Agent Foundation)

---

### Phase 8: Plugin Ecosystem

**Goal:** 插件市场和生态系统

**Requirements:**
- PLG-03: 插件 API 和 SDK (Priority: Low)
- PSC-02: 增强的安全控制和访问管理 (Priority: High)

**Success Criteria:**
1. 插件 API 和 SDK
2. 增强的安全控制和访问管理
3. 插件市场和支持
4. 插件版本管理和兼容性
5. 提供丰富的示例插件

**Dependencies:** Phase 5 (Plugin Architecture)

---

## Traceability Matrix

### Phase 1 -> Requirements
| Phase | Requirements |
|-------|--------------|
| 1 | GOV-01, GOV-02, GOV-04 |
| 2 | MAC-01, MAC-02, MAC-04 |
| 3 | WFT-01, WFT-02 |
| 4 | ANM-01, ANM-02, ANM-04 |
| 5 | PLG-01, PLG-02 |
| 6 | PSC-01, PSC-03, PSC-04 |
| 7 | MAC-03, ANM-03 |
| 8 | PLG-03, PSC-02 |

### Cross-Phase Dependencies
```
Phase 2 --> Phase 7 (Multi-Agent)
  |
  +--> Phase 5 --> Phase 8 (Plugin Ecosystem)

Phase 1, 3, 4, 6: Independent
```

---

## Notes

- 所有 Active 需求已分配到具体的阶段
- 每个阶段有明确的成功标准和依赖关系
- 阶段 1-6 相对独立，可以并行开发
- 阶段 7 和 8 分别依赖于阶段 2 和 5
