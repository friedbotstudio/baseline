---
key: tier1-merge-option-design-picks
category: decisions
scope: [spec]
source: archived bundle at `docs/archive/2026-05-22/tier1-merge-option/` (intake, scout, research, spec, security, spec.approved).
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Decision: the tier-1 upgrade prompt's fourth option is **Merge** (replacing the prior "Show diff"). When the user picks Merge, the CLI stages the INCOMING bytes BASE-less via `writeStageBaseless` under `.claude/state/upgrade/<ts>/`; reconciliation defers to `/upgrade-project` in Claude Code. Four design picks shipped together:
  - **D1 = 1A**: stage-manifest discriminator is `base_sha256: null` (JSON null literal) — three-way entries carry 64-hex, two-way entries carry `null`. `stage_version` stays at 1 (backward compatible with v0.7.0 stages, which never contain null).
  - **D2 = 2C**: `.claude/hooks/memory_session_start.mjs` scans for pending stages and emits a nag regardless of `.claude/state/workflow.json` presence — stages are stable infrastructure debt, distinct from memory-candidate debt.
  - **D3 = 3A**: reuse the existing `SEMANTIC_MERGE_STAGED` ACTION_KIND. Per-tier classification lives in the stage manifest (D1), not in the action stream — terminal label `staged for /upgrade-project` is correct for both tier-3 SEMANTIC and tier-1 Merge.
  - **D4 = 4C**: `.claude/skills/upgrade-project/SKILL.md` restructured with a classification preamble + named three-way sub-procedure + named two-way sub-procedure + shared Constraints. The zero-drift renumbering rule lives only in the three-way sub-section; the two-way sub-section explicitly disclaims it (no BASE anchor to shift against).
- Rationale: minimal new surface (no new ACTION_KIND, no new hook, no schema-version bump), preserves backward compat (v0.7.0 stages stay readable), keeps the user-facing CLI report unchanged. The architectural seam was the manifest discriminator — once `null` carries the BASE-less signal, every downstream component branches on it cleanly.
- Alternatives rejected:
  - **base_recoverable: false discriminator** (research D1-B): adds a new schema field for a binary signal that `base_sha256: null` already carries.
  - **New BASELESS_MERGE_STAGED action kind** (D3-B): violates YAGNI — terminal label is identical, internal classification is in the manifest.
  - **Sibling SessionStart hook** (D2-B): schema impact on settings.json + audit-baseline + seed.md + Article VIII is significant for a 30-line scan.
  - **Two parallel SKILL.md procedure sections** (D4-B): constraints duplication causes drift.
  - **In-tree `<rel>.upgrade` sidecar** (rejected at intake AskUserQuestion): pollutes the project tree; staged location keeps state under `.claude/state/`.
  - **project.json field for pending-merge tracking** (rejected at intake): drift risk vs filesystem truth.
