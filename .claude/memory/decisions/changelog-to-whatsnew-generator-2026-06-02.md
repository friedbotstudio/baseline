---
key: changelog-to-whatsnew-generator-2026-06-02
category: decisions
scope: [spec]
---

- Decision: the `changelog` skill (former Phase 11.5) is renamed `whatsnew` and reclassified from a workflow phase into a new on-demand `generators` category. It emits a structured JSON fragment to `.claude/state/whatsnew/<slug>.json` (gitignored, transient, no version field) and never writes `CHANGELOG.md`, which is owned solely by `@semantic-release/changelog` in CI. An optional `project.json -> whatsnew.route_workflow` knob names a per-project routing workflow that consumes the fragment; routing is the project's concern (the baseline ships only the generator + the seam). `/init-project` actively prompts to scaffold a routing workflow (non-mandatory).
- Why: CHANGELOG.md had two writers (semantic-release version blocks + the Phase 11.5 `## [Unreleased]` curation) with no handoff, producing duplicate/drift (0.13.0 mirrored under Unreleased). Splitting machine record (CHANGELOG.md, CI) from human "what's new" narrative (generator -> per-project surface) removes the dual-ownership. "Upcoming"/version-forecasting was dropped: the site publishes alongside the npm artifact, so the version is always known at publish time.
- Rejected: (a) keep both writers + reset Unreleased at release (still dual-ownership); (b) keep the `changelog` name (confusing once CHANGELOG.md is machine-only); (c) commit the fragment (git churn + duplicates the routing target); (d) required routing knob (violates "neither path mandatory").
- How to apply: removed the `changelog` node from all 5 tracks (`commit.depends_on` -> `["grant-commit"]`, both jsonl mirrors + both materializer label maps); `SKILL_CATEGORIES` phases 11->10 + generators 1 (categories 12->13, "thirteen"); amended seed.md -> CLAUDE.md (Article IV) + src mirrors + CONSTITUTION Appendix B; `git mv` skill dir + manifest owners.skills key. The introducing workflow self-excepts its own `changelog` node (skill retired mid-run).
- Source: archived bundle at `docs/archive/2026-06-02/changelog-generator-routing/`.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
