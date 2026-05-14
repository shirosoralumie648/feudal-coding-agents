# Phase 8: Plugin Ecosystem - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `$gsd-discuss-phase 8 --auto` fallback; `gsd-sdk` unavailable, decisions inferred from roadmap, Phase 5 context, Phase 6 security hardening, and current source.

<domain>
## Phase Boundary

Complete the local trusted plugin ecosystem promised by the roadmap: a developer-facing plugin SDK surface, local plugin catalog/marketplace support, version and compatibility checks, example plugins, and stronger plugin security/access controls.

This phase remains a local single-tenant MVP. It must not introduce remote package installation, public marketplace publishing, network-dependent scanning, untrusted sandbox execution, multi-tenant auth, arbitrary UI injection, or dynamic dependency installation.
</domain>

<decisions>
## Implementation Decisions

### Ecosystem Shape
- **D-01:** Treat "marketplace" as a local curated catalog over installed/discovered plugin manifests, not a remote marketplace.
- **D-02:** Add explicit catalog entries with plugin id, name, version, lifecycle/install state, extension types, compatibility status, risk level, and operator-facing security summary.
- **D-03:** Keep plugin examples under `plugins/examples/*` as reviewable local files with valid `plugin.json` and entry files.
- **D-04:** Provide SDK helpers and docs for manifest authoring, extension declarations, compatibility checks, and security permission declaration.

### Compatibility and Versioning
- **D-05:** Add structured compatibility evaluation for `feudal-coding-agents` manifests. Unsupported app ids or version bounds should be visible in catalog/security output.
- **D-06:** Do not add package manager publishing, semantic-release, registry install, or remote update checks.

### Security and Access Control
- **D-07:** Extend plugin manifests with explicit security permissions. Empty permissions are low-risk by default.
- **D-08:** High-risk permissions such as process execution, secrets access, broad filesystem writes, or external network access require explicit admin approval before enabling.
- **D-09:** Route-level access control is local and deterministic: enabling high-risk plugins requires an explicit request payload, not ambient auth claims.
- **D-10:** Security review endpoints should expose risk, findings, required approval, and recommendations before a plugin is enabled.

### UI Surface
- **D-11:** Add a dense operator console panel for plugin ecosystem status: local catalog rows, risk/compatibility badges, extension counts, and SDK/example pointers.
- **D-12:** The UI should remain operational and compact, consistent with the existing console. No landing page, marketing hero, remote install flow, or decorative marketplace layout.

### Agent's Discretion
- Exact type names and route shapes may follow existing contracts/Fastify style.
- The implementation may keep examples lightweight as long as discovery can validate them.
- Marketplace install/uninstall actions may remain API-level unless a small UI action is necessary for acceptance.
</decisions>

<canonical_refs>
## Canonical References

### Phase Scope
- `.planning/ROADMAP.md` - Phase 8 goal, PLG-03/PSC-02 requirements, success criteria, and Phase 5 dependency.
- `.planning/REQUIREMENTS.md` - PLG-03 and PSC-02 requirement ids.
- `.planning/PROJECT.md` - Local single-tenant project boundary and enhanced security active requirement.

### Prior Phase Decisions
- `.planning/phases/05-plugin-architecture/05-CONTEXT.md` - Local trusted plugin boundary, Phase 8 deferred SDK/marketplace/security ideas.
- `.planning/phases/05-plugin-architecture/05-VERIFICATION.md` - Verified plugin contracts, store, discovery, lifecycle routes, and ACP adapter.
- `.planning/phases/06-performance-optimization/06-CONTEXT.md` - Local deterministic security scanning and no SaaS scanner boundary.

### Code Integration Points
- `packages/contracts/src/plugins/types.ts` - Plugin manifest contracts.
- `packages/contracts/src/plugins/sdk.ts` - Current internal SDK helper surface.
- `apps/control-plane/src/services/plugin-store.ts` - Plugin lifecycle source of truth.
- `apps/control-plane/src/services/plugin-discovery.ts` - Local manifest discovery.
- `apps/control-plane/src/routes/plugins.ts` - Plugin lifecycle route surface.
- `apps/control-plane/src/server.ts` - Control-plane route and service wiring.
- `apps/web/src/lib/api.ts` - Web API helpers.
- `apps/web/src/app.tsx` - Operator console composition.
- `apps/web/src/styles.css` - Existing panel/table styling.
</canonical_refs>

<deferred>
## Deferred Ideas

- Remote marketplace publishing, search, install, payment, or updates.
- Untrusted plugin sandboxing and dependency isolation.
- Public authentication/authorization or multi-tenant policy.
- Arbitrary frontend component injection from plugins.
- Filesystem watching for automatic reload.
</deferred>

---

*Phase: 08-plugin-ecosystem*
*Context gathered: 2026-05-04 via file-based GSD fallback*
