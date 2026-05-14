# Milestones

## v1.0 MVP (Shipped: 2026-05-14)

**Delivered:** A local, single-operator Feudal Coding Agents MVP with governance, multi-agent coordination, workflow templates, analytics, plugin lifecycle, scheduler support, security hardening, and a trusted local plugin ecosystem.

**Phases completed:** 1-8 (27 plans, 44 tasks)

**Key accomplishments:**
- Added conditional governance rules, local RBAC, role routes, complexity scoring, and auto-approval behavior.
- Added ACP gateway messaging, registry, discovery, heartbeat, health, failover, and scheduler routes.
- Added code-first workflow templates with parameter interpolation, dependency ordering, version history, export/import, and REST APIs.
- Added analytics snapshots, SSE metrics, alert rules, audit trail views, and web console panels.
- Added plugin contracts, lifecycle APIs, enabled extension catalog, ACP adapter, local marketplace/security routes, SDK docs, and an example plugin.
- Added performance and safety hardening through metrics caching, read-model fan-out reduction, execution artifact scanning, and a green root typecheck gate.

**Verification:**
- `COREPACK_HOME=/tmp/corepack corepack pnpm typecheck`
- `COREPACK_HOME=/tmp/corepack CHOKIDAR_USEPOLLING=true corepack pnpm test -- --pool=forks` - 62 files / 571 tests passed.
- `COREPACK_HOME=/tmp/corepack corepack pnpm build`
- `git diff --check`

**Known closeout debt:**
- Milestone audit status is `tech_debt`, not `passed`, because Phases 1-4 have verification reports but no Nyquist `*-VALIDATION.md` artifacts.
- This closeout commit establishes the v1.0 source boundary; the `v1.0` git tag should point at this commit.

**Archived:**
- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

**What's next:** Push the release commit/tag if desired, or start v1.1 with `$gsd-new-milestone`.
