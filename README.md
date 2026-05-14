# feudal-coding-agents

Feudal-style Codex cluster prototype with a Fastify control plane, an ACP gateway, a React web console, and event-sourced replay/recovery for task execution.

## 文档权威说明

为结束随性编码并进入工程化推进，本仓库文档按以下权威顺序使用：

1. **代码与配置实证**：`apps/*`、`packages/*`、`package.json`、`pnpm-workspace.yaml`、`.github/workflows/ci.yml`
2. **当前审计与路线图基线**：`CURRENT_STATUS.md`、`ROADMAP.md`
3. **运行时架构说明**：`docs/ARCHITECTURE.md`
4. **术语冻结基线**：`docs/TERMINOLOGY.md`
5. **当前有效 specs**：`docs/superpowers/specs/*.md`
6. **过程性 plans**：`docs/superpowers/plans/*.md`
7. **历史/灵感文档**：`三省六部Agent集群架构设计.md`

### 使用规则
- 判断**当前系统是什么**：优先看代码与配置，其次看 `CURRENT_STATUS.md`。
- 判断**模块边界和协调关系**：优先看 `docs/ARCHITECTURE.md`。
- 判断**术语应该怎么解释**：优先看 `docs/TERMINOLOGY.md`。
- 判断**接下来做什么**：优先看 `ROADMAP.md`。
- 判断**某一能力最初如何设想**：再看对应 `specs`。
- `plans` 仅解释阶段性实现过程，不作为现状权威依据。
- `三省六部Agent集群架构设计.md` 仅保留为历史架构叙事与灵感来源，**不得当作当前运行时事实依据**。

## 当前系统边界

当前主交付链路是一个 **单机、单用户、pnpm monorepo 的治理型多 Agent 控制系统**：

- `apps/control-plane`: task intake、governance、operator actions、replay APIs、orchestration
- `apps/acp-gateway`: ACP-facing run service、worker execution bridge、run persistence/recovery path
- `apps/web`: Vite + React console for overview、approvals、operator queue、replay timeline、diffs
- `packages/contracts`: shared Zod schemas and TypeScript domain types
- `packages/orchestrator`: deterministic task state machine
- `packages/acp`: ACP client/runtime abstractions
- `packages/persistence`: Postgres event store and migrations

> 说明：当前实现并不是“完整三省六部运行时集群”，而是保留该命名框架下的**现实可运行子集**。真实运行角色以 `apps/acp-gateway/src/manifests.ts` 为准。

当前运行时主流水线固定为 6 个必备 agents：

- `intake-agent`
- `analyst-agent`
- `auditor-agent`
- `critic-agent`
- `gongbu-executor`
- `xingbu-verifier`

另外还实现了一个默认关闭的可选扩展角色：

- `fact-checker-agent`

控制平面内部已经按任务编排、治理、operator、回放四类协调器拆分；web 控制台也按数据加载与 mutation 服务做了分层。细节见 `docs/ARCHITECTURE.md`。

## Workspace

- `apps/control-plane`: task intake, approvals, replay APIs, and orchestration.
- `apps/acp-gateway`: ACP-facing run service and Codex worker execution bridge.
- `apps/web`: Vite + React console for overview, approvals, replay timeline, and diffs.
- `packages/contracts`: shared Zod schemas and TypeScript domain types.
- `packages/orchestrator`: deterministic task state machine.
- `packages/acp`: ACP client/runtime abstractions.
- `packages/persistence`: Postgres event store and migrations.

## Prerequisites

- Node.js 20+
- `pnpm` 10
- Optional Postgres for persisted recovery flows via `DATABASE_URL`

Without `DATABASE_URL`, the apps run with in-memory stores. With `DATABASE_URL`, startup rebuilds task and run projections from persisted events.

## Quick Start

```bash
pnpm install
pnpm dev
```

Default local endpoints:

- Web console: `http://localhost:5173`
- Control plane: `http://localhost:4000`
- ACP gateway: `http://localhost:4100`

## Common Commands

```bash
pnpm test
pnpm build
pnpm e2e
pnpm db:migrate
```

- `pnpm test`: run the full Vitest workspace suite.
- `pnpm build`: build the web console.
- `pnpm e2e`: run the Playwright browser flow for the web app.
- `pnpm db:migrate`: apply Postgres migrations for the persistence package.

## Current Scope

The repository currently supports task creation, optional fact-checking before review, approval-gated execution, assignment artifacts for executor input, ACP run tracking, replay APIs, recovery summaries, restart recovery verification, local RBAC role management, workflow templates, analytics/alerts, agent registry/health/scheduling, and a local trusted plugin ecosystem. Public identity-provider integration and multi-tenant governance remain out of scope.
