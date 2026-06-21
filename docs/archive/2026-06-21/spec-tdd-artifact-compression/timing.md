# Phase timing — spec-tdd-artifact-compression (RECONSTRUCTED)

> **Reconstructed from the harness log** (`.claude/state/harness/<slug>.log` entered/completed stamps), NOT the `phase_timer` hook — this run was driven by a manual Bash-appended harness, which bypasses the Write/Edit PostToolUse matcher the hook keys on (see backlog `-v0lv` DATA POINT 3). No token columns (those need the live transcript). First **intake-full / spec-entry** sample; pair with DATA POINT 1 (tdd-quickfix, 20m) for cross-track ranking.

Run: 2026-06-21T12:46:56Z → 14:17:22Z (harness start → grant-commit yield) = **1h30m26s = 5426s** (excludes the pending grant-commit wait + commit).

| Phase | Wall-clock | % of run | Notes |
|---|---:|---:|---|
| intake | 372s (6m12s) | 6.9% | incl. brainstorm Socratic dialogue (3 AskUserQuestion round-trips) |
| scout | 279s (4m39s) | 5.1% | 3 parallel Explore agents (consumer enumeration) |
| research | 137s (2m17s) | 2.5% | — |
| spec | 229s (3m49s) | 4.2% | full 6-diagram spec authoring (the 97k-token phase) |
| spec-shippability-review | 27s | 0.5% | mechanical, CLEAN |
| **gate-A region** | **452s (7m32s)** | **8.3%** | MIXED: surfaced 5 open-Qs → user decided → I amended spec + re-lint → user approved |
| approve recording | 52s | 1.0% | token write |
| tdd coordinator | 198s (3m18s) | 3.6% | recipe + contract + verification-gate grep |
| scenario-tick | 253s (4m13s) | 4.7% | 9 failing tests (5 files) |
| **implement-tick** | **1537s (25m37s)** | **28.3%** | DOMINANT — code + seed drive-by investigation (2 AskUserQuestions) + build + RALPH |
| verify-tick | 91s (1m31s) | 1.7% | full-suite stamp |
| drift-check-tick | 283s (4m43s) | 5.2% | incl. ~162s AC-005 decision yield (user chose positive-evidence test) |
| simplify | 99s (1m39s) | 1.8% | clean pass, zero edits |
| **security** | **652s (10m52s)** | **12.0%** | review + 2 AskUserQuestions (findings, hooks-vs-security) + fix-loop (tests+code+build) |
| integrate | 113s (1m53s) | 2.1% | binding serial suite (1030 tests) |
| document | 278s (4m38s) | 5.1% | 1-cell hooks.njk fix + survey |
| archive | 41s | 0.8% | 7 artifacts + timing render |
| memory-flush | 251s (4m11s) | 4.6% | 2 promoted, 1 edit, sweeps |
| cli-copy-review | 21s | 0.4% | no-op (no CLI surface) |

_(Phase rows + ~6% inter-phase orchestration overhead ≈ the 5426s total.)_

## Reconstructed analysis (DATA POINT 3)

**Cross-track contrast — intake-full is ~4.5× a tdd-quickfix (90m vs 20m).** The full pipeline's discovery phases (intake+scout+research+spec+review ≈ 1044s / 19%) are real overhead a quickfix skips, but they're NOT the bulk.

**The bulk is implement (28%) + security (12%) = 40%** — and both were inflated by **mid-phase human-decision round-trips + fix-loops**, not raw generation:
- implement's 25m absorbed the seed-template drive-by (2 AskUserQuestions + investigation) on top of the feature.
- security's 11m absorbed a full fix-loop (2 findings → tests → code → build) — i.e., a *second* implement pass.

**Human-wait is materially higher than DATA POINT 1 (~4%).** Identifiable yields: gate-A region 452s + AC-005 decision ~162s + (pending grant-commit). But most decision latency is EMBEDDED in phase durations (the AskUserQuestions inside intake/implement/security/drift are synchronous), so a clean model-vs-human split isn't separable from this log — a limitation the hook (had it fired) would have resolved via consent-token mtimes.

**Ranking implications (one intake-full sample — caveat accordingly):**
- **Lever 2 (right-size triage):** this feature genuinely needed the full apparatus, so the lever here isn't "skip phases" — it's that a security finding triggering a full second fix-loop (the 11m security phase) is where multi-pass cost concentrates.
- **Lever 5 (collapse human round-trips) is MORE relevant here than in DATA POINT 1:** this run had ~7 decision gates (5 at gate A + 2 each in security/drift/seed). Front-loading/batching those would meaningfully cut wall-clock — unlike the model-bound quickfix where Lever 5 capped at 4%. **The two samples now bracket the answer: track-type flips whether a run is model-bound (quickfix) or decision-latency-bound (intake-full with findings).**
- **NEW observation:** a security/drift finding mid-pipeline effectively re-runs implement (tests→code→build→re-verify). That "fix-loop tax" (~11m here) is invisible in a no-findings run. Worth measuring across runs.

CAVEAT: reconstructed (no hook stamps, no tokens), one intake-full sample, decision latency embedded-not-separable. The instrumentation fix (`-v0lv` DATA POINT 3 note) must land before cross-track ranking is trustworthy.
