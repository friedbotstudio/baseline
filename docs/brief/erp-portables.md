# Brainstorm brief — erp-portables

## Actor

The baseline maintainer (repo owner) — sole stakeholder; owns both this dev repo and the ../erp consumer install.

## Trigger

Constitutional changes made and proven live in the ../erp consumer project were observed to improve the system; the maintainer asked to extract them and apply them upstream in the baseline. (Maintainer verbatim: "I made some constitutional changes and they seems to improve the system for better.")

## Current State

Baseline (post v0.19.0, HEAD 7d1af61) lacks the ten portable improvements. ../erp carries them as deliberate, committed amendments: Article II §4.2-A read-only advisory subagents; branch_guard hook (25→26); branch-aware gate C with requires_commit_consent conditional DAG node; leanest-safe-track triage with novelty classification; opt-in derivation-first brainstorm (probe cap 2, timeout-adopts-recommendation); XI.12 decision economy; VI.4 YAGNI floor/ceiling + two-sided faithful scope BLOCKER in spec-traceability-review; lint_runner/test_runner file_globs fix; commit-planner + retrospective skills; mandatory-gitleaks + branch-protection-as-code + low-risk auto-merge CI posture. Three read-only extraction reports (CLAUDE.md delta, .claude structural delta, commit-intent analysis) ground every slice.

## Desired State

All ten improvements adopted in the baseline: docs/init/seed.md amended first (Art I.4), then CLAUDE.md + src/CLAUDE.template.md byte-equal mirror (40k cap — detail relocated to the annex), then implementation (hooks, skills, schema, workflows.jsonl, manifest, counts 25→26) — landing as ten separately-reviewed epic-child commits. erp defaults adopted where policies flip (brainstorm opt-in, leanest track default). Generalized where erp hard-codes its stack (CI check contexts, skill ownership).

## Non Goals

ERP-specific content does NOT port: the five domain guardians and governance-review phase, .claude/governance/ charter (U1–U12, role fleet), platform/solution boundary-guard hooks, record-review/record-verification scope-hash tokens, communicator voice register (XI.6), Golden Rule (XI.7), where-things-live (XI.11). erp's org-track deferral also does not port — baseline keeps its live org track (porting the deferral would be a regression).

## Solution Leakage

The entire request is deliberately solution-shaped: it is a port of a proven reference implementation, not an open design problem. Scope (all four sets), defaults (erp defaults), track (epic), and slice decomposition (10 slices A–J) were confirmed by the maintainer via AskUserQuestion this session; two confirmations timed out and adopted the recommended option as a recorded assumption, to be re-surfaced at the spec-approval gate.
