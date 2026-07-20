---
key: governance-class-input-half-A1-A5
category: landmarks
scope: [scout]
verified-at: 9542a7f
last-touched: 2026-07-15
---

- Path: `.claude/hooks/lib/tier-dial.mjs` (`GOVERNANCE_CLASSES`/`classFloor`/`raiseClass`) + `.claude/skills/triage/governance-class.mjs` (`extractSignals`)
- Role: Epic 2 input-half (roadmap A1–A5, shipped 2026-07-15). The Governance Class `{D,C,B,A}` (ascending rigor) is derived mechanically from blast-radius signals (`consentAdjacent`→A, `sensitiveSurface`→≥B, `hookOrGovernance`→≥C, tier-lift, wide-change bump) combined with the tier dial's per-tier floor; **raise-only** (`raiseClass` clamps to floor, never below). A1 EXTENDS the tier dial — no parallel classifier (Ledger #0002 D8). `/triage` Step 0 writes `workflow.json → governance_class`.
- Consumers: `.claude/skills/spec/evidence-ladder.mjs` (A2 — class→cumulative evidence rungs D authorize/C +understanding/B +reasoning/A +alternatives,tradeoffs,confidence; `checkEvidenceShape` is PRESENCE-only, invariant to length/authorship = D3); `.claude/skills/brainstorm/discipline.mjs` `scanTurn` `multiple-choice-probe` category (A3); `.claude/skills/spec/approval-provenance.mjs` + `.claude/hooks/lib/approval-anchor.mjs` + `spec_approval_guard.mjs` A4 block (A4 — the `/approve-spec` token anchors to an `approval-provenance` evidence-ledger entry via `ledger_ref:`; **ADDITIVE to the human consent marker, never replaces it**; fail-safe BLOCK on unverifiable anchor; `evidence-ledger.appendApprovalProvenance` writes the entry); `flag-parser.resolveSkipBrainstorm({governanceClass})` (A5 — Class A/B is a hard floor that cannot skip and overrides `--no-brainstorm`; D skips; C/undefined unchanged).
- Gated by `governance.class.enabled` + `governance.approval_provenance.enabled` (both default OFF; absent key = off). Introduction-workflow pattern — goes live the workflow AFTER the one that landed it.
- Tests: `tests/governance-class-classifier.test.mjs`, `evidence-ladder.test.mjs`, `discipline-mc-probe.test.mjs`, `approval-provenance.test.mjs`, `skip-brainstorm-class.test.mjs`.
- Caveat: `spec_approval_guard`'s A4 block only runs under `approval_provenance.enabled` (default off) — flipping it on before the approve-spec flow writes ledger entries fail-CLOSES gate A (every /approve-spec blocks). Rollout order: flip `class.enabled` first, `approval_provenance.enabled` only after ledger entries are observed (spec Rollout + `docs/archive/2026-07-15/input-half-governance-class/security.md`).
