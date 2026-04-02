# Codex Feudal Cluster Design

## Overview
This project will be implemented as a `Codex cluster` with a `Web control plane`, while preserving the `three departments and six ministries` operating model from the existing architecture note. The first release is for a `single developer`, not a multi-tenant platform. The goal of the MVP is not full autonomous coding. The goal is to prove a real multi-agent collaboration loop with visible governance, ACP-native communication, and human approval at key checkpoints.

## Product Scope
The MVP will provide a web console where a developer can:

- submit a natural-language task
- watch it move through `intake -> planning -> review -> approval -> dispatch -> execution -> verification`
- inspect artifacts produced by each role
- approve, reject, or revise the task at formal checkpoints

The first release will preserve the organizational shape of `宰相府`, `三省`, and `六部`, but some ministries will begin as lightweight rule services instead of full autonomous agents. The execution layer must be real: multiple Codex-based agents must actually run and exchange structured messages through ACP.

## Approaches Considered
### Option A: Fully distributed three-department six-ministry services
Each department and ministry becomes an independent ACP service. This is the most faithful to the source design, but it adds too much operational complexity for the first release. Service discovery, cross-service state sync, and debugging would dominate the schedule.

### Option B: Web control plane plus ACP execution plane
Use a central control plane for state, routing, approvals, and observability. Connect it to a smaller set of real Codex agents through ACP. Represent all `three departments and six ministries` in the UI and workflow, while allowing some roles to be deterministic services or lightweight agents.

This is the recommended approach. It preserves the intended governance model, keeps ACP as the execution protocol, and is realistic for an MVP.

### Option C: ACP-native peer-to-peer cluster
Let all agents communicate as peers and use the web layer only for observation and manual approvals. This is protocol-pure but makes governance, replay, and audit much harder. It also weakens the institutional shape the project wants to preserve.

## Recommended Architecture
### Control plane
The control plane is the system authority. It owns task state, approval state, routing decisions, audit logs, and artifact indexing. It is responsible for presenting the `three departments and six ministries` model in the UI and ensuring that the execution graph remains deterministic.

`尚书省` should be implemented here as a deterministic orchestrator, not as another LLM agent. This avoids letting the control layer hallucinate or drift.

### ACP execution plane
The control plane acts as an ACP client. It discovers agent capabilities from manifests, creates runs, waits on approval requests, and collects artifacts. ACP should be treated as the standard transport and run lifecycle, not as the place where business truth lives.

The design depends on ACP support for:

- agent manifests
- run lifecycle
- awaiting external input
- structured artifacts

### Role mapping
- `宰相府 / intake-agent`: normalize user requests and produce `TaskSpec`
- `中书舍人 / liaison-agent`: clarify intent and constraints when needed
- `中书侍郎 / analyst-agent`: decompose tasks and produce `DecisionBrief`
- `采风司 / fact-checker-agent`: lightweight dependency and reference validation in phase 1
- `门下给事中 / auditor-agent`: consistency and risk review
- `门下谏官 / critic-agent`: adversarial review with explicit dissent
- `尚书省 / orchestrator`: deterministic routing, state transitions, retry policy, aggregation
- `吏部 / dispatcher`: assign approved work to executors
- `工部 / gongbu-executor-*`: real Codex workers
- `刑部 / xingbu-verifier`: verify execution output and evidence
- `兵部`, `户部`, `礼部`: phase 1 rule-based services with visible status in the UI

## User Experience
The first release should include five screens:

1. `Overview`
Shows active tasks, ministry swimlanes, approval queue, and recent failures.
2. `New Task`
Creates a task from natural language and optional control settings.
3. `Task Detail`
Displays timeline, ACP run states, artifacts, and role-by-role output.
4. `Approval Inbox`
Handles all `awaiting` states with explicit user actions.
5. `Agent Registry`
Lists discovered ACP agents, manifests, capabilities, health, and recent performance.

The `Task Detail` page is the center of the MVP. It should make the institutional workflow visible, not hide it behind a generic chat transcript.

## ACP Business Model
ACP remains the transport, while project-specific semantics sit in structured artifacts. The first release should define these payload families:

- `application/vnd.feudal.taskspec+json`
- `application/vnd.feudal.decision-brief+json`
- `application/vnd.feudal.review+json`
- `application/vnd.feudal.assignment+json`
- `application/vnd.feudal.execution-report+json`

Rules:

- user input enters as `role=user`
- agent responses are attributed as `role=agent/<name>`
- important outputs must be returned as artifacts, not only plain text
- approval pauses must map to ACP `awaiting` states

Artifacts should use stable names such as `taskspec.json`, `decision-brief.json`, `review.json`, and `execution-report.json`.

## Runtime State Machine
The task state machine should be explicit and deterministic:

`draft -> intake -> planning -> review -> awaiting_approval -> dispatching -> executing -> verifying -> completed`

Additional terminal or branch states:

- `needs_revision`
- `partial_success`
- `rejected`
- `failed`
- `rolled_back`

Key rules:

- only the control plane may change the authoritative task state
- `awaiting_approval` must be triggered by ACP await semantics
- sub-runs may execute in parallel, but the task owns one authoritative lifecycle
- every state transition is recorded to the audit stream

## Standard Task Flow
1. The user submits a request in the web console.
2. `intake-agent` produces a structured `TaskSpec`.
3. `analyst-agent` produces a `DecisionBrief` and candidate sub-tasks.
4. `auditor-agent` and `critic-agent` review in parallel.
5. If the review passes, the task pauses at `awaiting_approval`.
6. The user approves, rejects, or requests revision.
7. The orchestrator converts approved work into `assignment` artifacts.
8. Multiple `gongbu-executor-*` agents execute in parallel where possible.
9. `xingbu-verifier` validates the outputs and produces an `execution-report`.
10. The control plane aggregates the final record for display and replay.

## Error Handling
The MVP only needs four recovery mechanisms:

- `review revision loop`: a task may be sent back to planning, capped at two cycles
- `executor retry`: each failing executor task may retry once
- `human takeover`: users may resume a failed or awaiting task with new instructions
- `partial success`: the task may close with usable results even if some sub-tasks fail

Saga compensation, multi-model fallback, and deep rollback policies remain later-phase work.

## Testing Strategy
Phase 1 testing should focus on system truth, not breadth:

- ACP contract tests for manifests, runs, await states, and artifacts
- orchestrator state machine tests
- end-to-end scenario tests for the full planning-review-execution loop
- UI integration tests for task detail, approval inbox, and swimlane rendering

## Phase Plan
### Phase 1: Skeleton
Build the web shell, task model, orchestrator state machine, ACP client layer, and agent registry.

### Phase 2: Real collaboration loop
Connect real Codex agents for intake, analysis, audit, critique, execution, and verification. Support the full single-user task flow.

### Phase 3: Governance enhancements
Add lightweight fact checking, budget and security rule services, retry policies, replay views, and basic metrics.

## Non-Goals
The MVP does not require:

- automatic code patch generation as the primary success metric
- fully independent infrastructure for all six ministries
- multi-tenant team workflows
- production-grade budget, security, or legal enforcement
- deep vector knowledge systems

## Success Criteria
The first release is successful if one developer can submit a task, watch it move through the `three departments and six ministries` workflow, see real Codex agents collaborate through ACP, approve at key checkpoints, and inspect a complete record of artifacts and decisions in the web console.
