# Feudal Coding Agents

## What This Is

Feudal Coding Agents is a local, single-operator AI coding workflow control plane. It combines a Fastify control-plane API, an ACP gateway, a React operator console, shared Zod contracts, event-sourced persistence, and deterministic governance so a human operator can supervise multi-agent software delivery.

## Core Value

让 AI 代理能够可靠地协作完成复杂的软件开发任务，同时保持人类操作员的治理和监督能力。

## Current State

**Shipped milestone:** v1.0 MVP archived on 2026-05-14.

The v1.0 system supports task intake, governance policy enforcement, approval and revision flows, operator recovery actions, ACP run tracking, replay APIs, workflow templates, analytics and alerts, audit trail views, dynamic agent registry and health checks, capacity-aware scheduling, plugin lifecycle APIs, local plugin marketplace/security review, and a compact web console.

**Release note:** This closeout commit establishes the v1.0 source boundary. The `v1.0` git tag should point at this commit.

## Requirements

### Validated

- ✓ **Task Lifecycle Management** - Existing baseline.
- ✓ **Governance Policy Enforcement** - Existing baseline plus v1.0 conditional rule contracts, RBAC, role routes, complexity scoring, and auto-approval.
- ✓ **Operator Action System** - Existing baseline.
- ✓ **Event Sourcing Architecture** - Existing baseline plus replay/read-model hardening.
- ✓ **ACP Gateway** - Existing baseline plus v1.0 messaging, registry, discovery, heartbeat, failover, and scheduler route support.
- ✓ **Worker/Agent Execution** - Existing baseline.
- ✓ **Run Lifecycle Management** - Existing baseline plus run projection/replay coverage.
- ✓ **Web Operator Console** - Existing baseline plus analytics, audit trail, alerts, scheduler-facing data, and plugin ecosystem panels.
- ✓ **Task Lane Visualization** - Existing baseline.
- ✓ **Recovery Action Interface** - Existing baseline.
- ✓ **Metrics and Monitoring** - Existing baseline plus v1.0 metrics route wiring, cache, analytics, SSE, and alerts.
- ✓ **Workflow Templates** - v1.0 code-first template contracts, engine, storage, version history, export/import, and REST APIs.
- ✓ **Plugin System** - v1.0 plugin contracts, lifecycle store, local discovery, extension catalog, ACP adapter, SDK helpers, local marketplace, security review, and example plugin.
- ✓ **Performance Optimization** - v1.0 read-model fan-out reduction and explicit typecheck gate.
- ✓ **Enhanced Security** - v1.0 execution artifact scanner and plugin permission/high-risk approval controls.

### Active

- [ ] **Nyquist Backfill** - Optionally create `*-VALIDATION.md` artifacts for Phases 1-4 so the milestone audit can move from `tech_debt` to `passed`.
- [ ] **Next Milestone Definition** - Define v1.1 requirements and scope with `$gsd-new-milestone`.

### Out of Scope

- **General-purpose workflow engine** - The product stays focused on AI coding workflows.
- **Multi-tenant SaaS architecture** - v1.0 remains single-tenant and local-first.
- **Public identity provider integration** - v1.0 uses local deterministic access boundaries, not OAuth/JWT provider integration.
- **Remote plugin or template marketplace** - v1.0 supports local trusted plugin catalog and template export/import only.
- **Untrusted plugin sandboxing** - v1.0 does not execute arbitrary remote plugin code or install plugin dependencies.
- **Visual workflow designer** - v1.0 is code-first.

## Context

### Technical Environment

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.8+
- **Package Manager:** pnpm 10+
- **Monorepo:** pnpm workspaces
- **Testing:** Vitest, Playwright E2E support
- **Build:** Vite

### Architecture Patterns

- **Control plane / execution plane split:** `apps/control-plane` owns task truth and governance; `apps/acp-gateway` owns ACP-facing execution services.
- **Event sourcing and CQRS:** event logs and projections preserve auditability and replay.
- **Zod contract-first boundaries:** `packages/contracts` is the shared schema/type source.
- **Process-local MVP services:** registry, scheduler, plugin catalog, and caches are local process services unless a future milestone changes that boundary.

### Known Issues And Debt

- Phases 1-4 have passed verification reports but no Nyquist `*-VALIDATION.md` artifacts.
- `task-read-model.ts`, `orchestrator-flows.ts`, and `use-task-console.ts` remain large files that deserve future decomposition.
- v1.0 audit status remains `tech_debt` until Nyquist validation artifacts are backfilled for Phases 1-4.

## Constraints

- **Tech stack:** TypeScript, Node.js, pnpm.
- **Deployment shape:** local/single-tenant first.
- **Persistence:** PostgreSQL is optional for local runs but remains the durability target for event storage.
- **Compatibility:** preserve existing ACP contracts and worker manifest semantics.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Event Sourcing Architecture | Need auditability and projection rebuilds. | Good |
| Feudal Hierarchy Model | Keeps role responsibilities visible to the operator. | Good, but runtime role truth must follow manifests. |
| Codex CLI Integration | Uses existing AI coding tooling through ACP-compatible boundaries. | Good |
| Code-first Workflow Templates | Avoids a premature visual designer and keeps workflows reviewable. | Good |
| Local Trusted Plugin Ecosystem | Provides useful SDK/catalog/security controls without remote install risk. | Good |
| Process-local Scheduler | Fits the MVP and avoids premature distributed infrastructure. | Good, revisit for multi-node scale. |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-14 after v1.0 milestone archive*
