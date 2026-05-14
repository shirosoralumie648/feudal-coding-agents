# Phase 7: Advanced Multi-Agent - Research

**Researched:** 2026-05-04
**Phase:** 07-advanced-multi-agent
**Goal:** Plan advanced multi-agent scheduling, bottleneck analysis, and failure recovery on the current ACP gateway foundation.

## Research Complete

Source priority was current code and tests, then `.planning/codebase/*`, then prior phase context.

## Phase Requirements

- `MAC-03`: Distributed task assignment.
- `ANM-03`: Performance bottleneck analysis.

## Current Architecture Findings

### Existing Multi-Agent Foundation

- `AgentRegistry` stores persistent and temporary agents in memory, optionally appending persistent registry events.
- `AgentDiscoveryService` already filters by capability, status, metadata, and glob-like capability patterns.
- `HeartbeatMonitor` derives `healthy`, `degraded`, and `unhealthy` health states from heartbeats and emits status-change events.
- `FailoverHandler` tracks task assignments and reassigns affected tasks when monitor events mark an agent unhealthy.
- ACP gateway server wires registry, discovery, message router, heartbeat monitor, failover handler, health routes, registry routes, messaging routes, and run routes into one process.

### Gap for Phase 7

- There is no dedicated scheduling API that chooses an agent for a task from a candidate fleet.
- Existing failover chooses replacement agents by current assignment count only; there is no capacity ratio, priority, tie-break rule, or bottleneck analysis.
- Run creation still targets a named worker. Phase 7 should not rewrite run lifecycle; it should create a reusable assignment layer that future run routing can consume.
- The current registry and health state is process-local. Phase 7 should expose future-friendly contracts while honestly documenting local semantics.

### Bottleneck Analysis Inputs

Useful current inputs:

- Registry metadata: capabilities, status, and optional scheduling metadata.
- Health monitor: health status and missed heartbeat counts.
- Scheduler state: active assignments, queued/operator-attention assignments, per-agent load, and capacity.

Useful derived bottleneck types:

- Overloaded agents: load ratio at or above 1.0.
- Missing capacity: pending assignment cannot find any healthy capable agent.
- Unhealthy assigned work: active assignment remains on an unhealthy or offline agent.
- Saturated capability: all healthy agents for a capability are at or above capacity.

### Route and Test Approach

- Follow existing Fastify route modules with injected services and Zod parsing.
- Add route tests with `Fastify({ logger: false })` and `app.inject()`.
- Add unit tests for scheduler scoring, capacity, failover, and bottleneck snapshots.
- Run focused gateway tests first, then root typecheck, full Vitest, and build.

## Recommended Plan Shape

1. Scheduler contracts and core load-aware assignment service.
2. Automatic scheduler recovery and bottleneck analyzer.
3. ACP gateway routes and server wiring.

## Constraints for Executors

- Keep state process-local and app-scoped.
- Do not add new external services, queue brokers, databases, or dependencies.
- Preserve all existing Phase 2 registry, messaging, health, and run endpoints.
- Use tests before implementation changes.
- Keep deterministic scoring so tests and operators can reason about assignment decisions.
