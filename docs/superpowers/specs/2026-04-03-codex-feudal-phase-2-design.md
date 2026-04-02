# Codex Feudal Cluster Phase 2 Design

## Overview
Phase 2 upgrades the Phase 1 skeleton into a real single-user collaboration loop. The control plane and web console already exist, but they currently depend on an in-memory mock ACP client and deterministic fake worker outputs. Phase 2 replaces that execution layer with a local ACP-compatible gateway that launches real Codex workers and exposes their lifecycle to the control plane.

The system still targets one developer working in one repository on one machine. Phase 2 does not attempt multi-host distribution, tenant isolation, or durable job infrastructure. The purpose is narrower: prove that the web console can drive a true `intake -> planning -> review -> approval -> execution -> verification` run where the workers are real Codex processes and the approval gate is a real ACP `awaiting` pause.

## Current Baseline
The repository now contains:

- `apps/control-plane`: Fastify API and deterministic workflow service
- `apps/web`: Vite and React control console with task creation and approval UI
- `packages/contracts`: task schemas and artifact types
- `packages/orchestrator`: authoritative task state machine
- `packages/acp`: ACP abstractions plus a mock runtime

This is a good Phase 1 foundation because the task state machine is already explicit and the UI already expects agent discovery, task creation, approvals, and artifacts. The missing piece is the execution plane.

## ACP Facts To Preserve
Phase 2 should align with current ACP concepts as documented by the official ACP docs:

- agent discovery through `GET /agents` and agent manifests
- run lifecycle states including `created`, `in-progress`, `awaiting`, `completed`, `failed`, `cancelling`, and `cancelled`
- resumable `awaiting` runs via `POST /runs/{run_id}`
- named artifacts as structured message parts, not ad hoc text blobs

Design implication: the control plane should consume ACP as a client. It should not invent a separate faux run model that drifts from the protocol.

Reference material:

- [Agent Discovery](https://agentcommunicationprotocol.dev/core-concepts/agent-discovery)
- [Agent Manifest](https://agentcommunicationprotocol.dev/core-concepts/agent-manifest)
- [Agent Run Lifecycle](https://agentcommunicationprotocol.dev/core-concepts/agent-run-lifecycle)
- [Await External Response](https://agentcommunicationprotocol.dev/how-to/await-external-response)
- [Message Structure](https://agentcommunicationprotocol.dev/core-concepts/message-structure)
- [Generate Artifacts](https://agentcommunicationprotocol.dev/how-to/generate-artifacts)

## Phase 2 Goal
Deliver one real collaboration loop where:

1. the web console creates a task through the control plane
2. the control plane uses a real ACP transport instead of the mock client
3. the ACP gateway advertises worker manifests and creates ACP runs
4. gateway workers invoke local `codex exec` commands to perform each role
5. review completion triggers a real ACP `awaiting` checkpoint
6. user approval resumes the run and dispatches real execution and verification workers
7. all important outputs return as named artifacts visible in the UI

## Chosen Architecture
### Control Plane Stays Authoritative
`apps/control-plane` remains the only owner of task truth. It keeps:

- task status
- review and approval status
- task history and audit events
- artifact indexing for UI consumption

This means ACP run state is informative but not authoritative. A run reaching `completed` does not by itself close the task. The orchestrator still decides when a task moves from `planning` to `review`, from `awaiting_approval` to `dispatching`, and from `verifying` to `completed`.

### New Local ACP Gateway
Add a new local service, `apps/acp-gateway`, that exposes ACP-compatible endpoints and manages worker runs. It acts as a bridge between the control plane and local Codex CLI processes.

Responsibilities:

- register and expose agent manifests
- accept run creation requests
- store transient run state in memory for Phase 2
- launch role-specific worker handlers
- emit `awaiting` runs for approval checkpoints
- resume paused runs when the control plane posts approval input
- return structured artifacts and failure details

The gateway is local-only in Phase 2. The control plane talks to it over HTTP on localhost.

### Codex Worker Adapter
The gateway should not embed role logic directly in route handlers. Instead, each ACP agent maps to a role-specific worker adapter that:

- receives normalized ACP input
- constructs a prompt template for the role
- invokes local `codex exec`
- parses structured JSON output
- converts it into ACP message parts and artifacts

Each role will use a strict output contract so the control plane can rely on predictable artifacts:

- `intake-agent` -> `taskspec.json`
- `analyst-agent` -> `decision-brief.json`
- `auditor-agent` -> `review.json`
- `critic-agent` -> `review.json`
- `gongbu-executor` -> `execution-report.json`
- `xingbu-verifier` -> `execution-report.json`

### Transport Refactor In `packages/acp`
`packages/acp` should become a transport layer, not a mock-only package. It should contain:

- shared ACP request and response types used in this repo
- a `createHttpACPClient` implementation for the control plane
- the existing mock client for tests
- test fixtures that assert discovery, run polling, awaiting, resume, and artifact handling

This keeps the control plane independent from how ACP is hosted.

## Task Flow In Phase 2
The Phase 2 happy path should look like this:

1. User submits a task in the web console.
2. Control plane creates a task record and calls the gateway `intake-agent`.
3. Gateway launches a Codex worker for intake and returns `taskspec.json`.
4. Control plane calls `analyst-agent`.
5. Gateway returns `decision-brief.json`.
6. Control plane launches `auditor-agent` and `critic-agent` in parallel.
7. If both reviews are non-blocking, the gateway creates an ACP run that pauses in `awaiting`.
8. Web console shows the awaiting run and approval action.
9. User approves in the web console.
10. Control plane resumes the awaiting run, creates assignment artifacts, and dispatches `gongbu-executor`.
11. Control plane sends executor artifacts to `xingbu-verifier`.
12. Verifier returns `execution-report.json`.
13. Control plane records final task state and shows all artifacts and run ids in the UI.

## UI Changes Required
The current UI is structurally sufficient, but Phase 2 needs three meaningful upgrades:

- `Task Detail` must show ACP run ids and live run states from the gateway, not only internal task status
- `Approval Inbox` must show the awaiting run prompt and allowed actions derived from ACP
- `Agent Registry` must display real manifest fields from the gateway rather than static mock data

No major UI redesign is needed. The phase is about truthfulness and observability, not visual expansion.

## Error Handling
Phase 2 only needs bounded recovery:

- worker execution failure maps the ACP run to `failed` and the task to `failed`
- malformed worker output fails fast with explicit parse errors
- approval resume on a non-awaiting run returns a protocol error and leaves task state unchanged
- gateway unavailability surfaces as control-plane integration failure
- verification failure may still produce task `partial_success` if execution output exists and verifier returns non-blocking issues

Retry policy should stay intentionally narrow:

- no automatic retry for planning or review agents
- one retry maximum for `gongbu-executor`
- no durable replay or queue resurrection yet

## Security And Safety Boundaries
Phase 2 should assume local trust, but still avoid obvious hazards:

- `codex exec` must run in the repository worktree only
- worker prompts must be generated from server-side templates, not arbitrary raw shell commands
- artifact parsing must validate JSON shape before accepting it into task history
- approval resumes must accept only declared actions

Secrets, tenant isolation, and remote sandbox brokering remain later-phase work.

## Testing Strategy
Phase 2 should add three categories of tests:

- ACP transport contract tests for discovery, run creation, polling, awaiting, resume, and artifacts
- gateway integration tests that stub `codex exec` and verify correct manifest and run behavior
- control-plane scenario tests for the real collaboration path using the HTTP ACP client against the gateway

One smoke path should also run the full local stack with stubbed or deterministic Codex prompts to prove the end-to-end loop.

## Non-Goals
Phase 2 does not include:

- multi-repository orchestration
- multi-machine worker scheduling
- durable database-backed run persistence
- autonomous branch creation or merge automation
- role expansion for `bingbu`, `hubu`, or `libu`
- advanced retry, budget control, or policy enforcement

## Success Criteria
Phase 2 is successful if one developer can submit a task in the web console, watch the task move through real ACP run states, approve a real `awaiting` checkpoint, and inspect artifacts produced by real Codex worker invocations for intake, analysis, review, execution, and verification.
