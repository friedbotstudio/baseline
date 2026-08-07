# Make a spec declare its delta against `docs/system/`, and make archive verify that delta against what actually landed

<!--
Intake document. Produced by the `intake` skill.
Cycle 2 of the central-system-spec plan (`.config/plans/i-guess-earlier-we-synthetic-moth.md`, sections C2-1..C2-6).
Cycle 1 landed as 9790ff3.
-->

## Problem

`docs/system/` landed on 2026-08-06 as a reviewed spec artifact — 15 concepts, 112 elements, 112 PlantUML shards. Cycle 1 (9790ff3) made it *reachable*: the concept map now ships at session start and a touched path walks up to its owning concepts. But the corpus is still **write-only in one direction and un-citable in the other**, so it can only decay from the day it landed.

Four concrete defects, verified on disk today:

| Defect | Evidence (verified 2026-08-07) |
|---|---|
| A spec never states what it changes in the model | `project.json → artifacts.required_sections.spec` is `["Goal","Design","Design calls","Acceptance criteria","Test plan"]`. No delta section exists, so design intent against the standing model is never written down and never reviewed. |
| Archive can only re-stamp, never grow | `archive` Step 5 calls `contribute.syncBack`, which re-stamps digests for anchors that already exist. A landing that *adds* a governed file silently creates a coverage gap. `coverage.findGaps` has no production caller. Zero gaps today only because the backfill landed 2 days ago. |
| Nothing in the corpus is citable as evidence | 0 of 112 shards carry a `' @kind` annotation, so `witness.bindingFor` returns `{witness:'none'}` for every element and the entire `project.json → memory.architecture_map.witnesses` block (8 kinds) is inert. |
| Corpus repair has no operator | Five helper APIs exist with no caller and no skill that composes them: `coverage.findGaps`, `reconcile.classify`, `reconcile.repairAfterMerge`, `shards.findUnillustrated`, and a shard *writer* that does not exist at all — nothing in the codebase writes a `.puml`. |

Concretely: today a maintainer lands a new hook at `.claude/hooks/foo_guard.mjs`. The spec that authorized it says nothing about the model. Archive re-stamps 112 unchanged digests and exits clean. `foo_guard.mjs` is now a governed-surface file that no element anchors, no concept owns, and no session-start map routes to — and nothing anywhere reports that.

Separately, `research` Phase 3 answers "who designed this before" by term overlap across `docs/archive/**`, ignoring the 14 elements that carry a `source_spec:` field pointing straight at the authoring spec.

## Goal

A spec declares its delta against the standing model, archive proves that delta against the landed diff before writing anything, and a dedicated skill repairs the corpus — so the model stays total, fresh, and citable as the repository changes.

## Non-goals

- **No stored or cached index.** Derived-on-read stays. This is backed by measurement recorded at `resolve.mjs:24` — a HEAD-keyed cache measured 29 ms against 17.5 ms for a full walk, and was wrong on non-git trees where `gitHead()` returns `''` forever. "Repair the corpus" means repairing records, never persisting a lookup table.
- **No composed view written to disk.** `readAll().views` stays empty per the landed decision `authored-records-are-not-stored-views-2026-08-06`.
- **No bulk digest refresh.** `digest.stampAll` keeps refusing without an explicit id list. That refusal is the mechanism, not an inconvenience.
- **`spec-sync`'s bootstrap path is not touched.** Its known defects (destructive on a populated corpus, writes no shards, derives no edges despite its SKILL.md claim) are recorded for a later cycle. `/system-reconcile` is a separate skill, not a mode of `spec-sync`.
- **Archive is not made a second writer.** Archive stays the corpus's single writer on the primary tree; the landed decision `corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06` is unchanged. `/system-reconcile` never repairs mid-workflow.
- **No raised test ceiling.** The `CLAUDE.md` budget is paid for by relocating existing narration to the annex, never by raising an asserted limit.

## Success metrics

- Shards carrying a `' @kind` annotation — baseline: **0 of 112**, target: **112 of 112**, measured via: `grep -l "' @kind" docs/system/diagrams/*.puml | wc -l`.
- Production callers of the orphaned corpus APIs (`coverage.findGaps`, `reconcile.classify`, `reconcile.repairAfterMerge`, `shards.findUnillustrated`) — baseline: **0**, target: **≥ 1 each**, measured via: grep for call sites outside `tests/`.
- Coverage gaps after a landing that adds a governed-surface file — baseline: **grows silently, unreported**, target: **reported by archive as an unclaimed gap, or closed by a confirmed delta row**, measured via: `coverage.findGaps({specDir:'docs/system'}).length` staying `0` plus the new archive-drift test.
- `CLAUDE.md` size after the amendment — baseline: **38,716 chars / 38,943 bytes**, target: **≤ 38,800 chars and ≤ 39,000 bytes**, measured via: `tests/gitignore-governance-cascade.test.mjs:45` and `tests/code-browser-primary-navigation.test.mjs:39`.

## Stakeholders

- **Requester**: Tushar Srivastava (repo owner; authored `.config/plans/i-guess-earlier-we-synthetic-moth.md`)
- **Reviewer**: Tushar Srivastava (sole approver at gate A; this repo has no second reviewer)
- **Operator**: Tushar Srivastava — runs `/harness`, `/archive`, and the new `/system-reconcile` in this repository, which is the canary for `memory.architecture_map.enabled`

## Constraints

- **Order of precedence is fixed (Art. I.4).** The constitutional amendment lands `seed.md` first, then `CLAUDE.md`, then implementation. `src/seed.template.md` and `src/CLAUDE.template.md` are byte-equal mirrors and `audit-baseline` enforces both.
- **`CLAUDE.md` has 84 chars and 57 bytes of slack.** The binding ceilings are the tests, not Article I.6's 40,000. The landmine `claude-md-real-headroom-is-test-enforced-38800-not-the-40000-cap` records this trap firing twice, the second time with the entry already on disk. Note the unit mismatch: an em dash is 1 char and 3 bytes.
- **Live-corpus assertions must stay green**: `workspace-coverage.test.mjs` (zero gaps, zero dangling), `workspace-readme-gate.test.mjs` (the README names no field no element carries — so the delta section adds no element field), `system-spec-sync.test.mjs` (`CANONICAL` stays 8, `readAll().views` stays empty).
- **Every consumer reads the flag as false.** `memory.architecture_map.enabled` ships absent from `src/project.template.json`; this repository is the only canary. Every new path is flag-gated and fail-open on absent flag, absent corpus, or read error.
- **Shipped helpers are `.mjs`/`.js`/`.sh`** and must appear in `obj/template/.claude/manifest.json`; `spec-shippability-review` blocks otherwise.
- **Six slices, separately committable, with a real dependency order.** The shard writer must exist before archive can write a shard; the delta section must exist before archive can verify a delta.

## Acceptance criteria

1. **Delta section is required.** Given `project.json → artifacts.required_sections.spec` includes `System delta`, when a spec is written without a `## System delta` heading, then `artifact_template_guard` blocks the write.
2. **Empty delta is legal.** Given a spec whose write set touches no governed-surface path, when its `## System delta` body is `*(none)*`, then `/spec-lint` and the guard both pass.
3. **Delta rows are validated.** Given a `## System delta` row with verb `add`, when its Anchor does not fall inside `memory.architecture_map.governed_surface`, then `/spec-lint` reports a failure naming the row; and given a `change` or `remove` row whose Element id does not resolve under `docs/system/elements/`, then `/spec-lint` reports a failure naming the row.
4. **Archive verifies before it writes.** Given an `add` row whose anchor does **not** appear in the landed diff, when `/archive` Step 5 runs, then no anchor is appended, no shard is written, no digest is stamped, and the row is reported as drift.
5. **Archive applies a confirmed row.** Given an `add` row whose anchor exists on disk and appears in the landed diff, when `/archive` Step 5 runs, then the anchor is appended to the named concept's `anchors:`, `materialize` re-runs, `stampElement` stamps the element, and a shard is written for it.
6. **Unclaimed gaps are reported.** Given a landing that touches a governed-surface path no delta row claims, when `/archive` Step 5 runs, then that path is reported as an unclaimed gap and nothing is written for it.
7. **A shard writer exists.** Given `writeShard(specDir, elementId, {kind, witnessTest, label})`, when it is called for an element, then a `.puml` shard is written at the corpus's shard path carrying a `' @kind <kind>` annotation.
8. **`/system-reconcile` reports before it repairs.** Given the live corpus, when `/system-reconcile` runs without human confirmation, then it writes nothing and emits a report covering all five checks (coverage gaps, stale/dangling elements, duplicate anchors and orphan shards, unillustrated elements, shards missing `' @kind`).
9. **Archive calls it report-only.** Given `/archive` Step 5.5, when it invokes `/system-reconcile`, then the invocation is report-only and repairs nothing mid-workflow.
10. **Every shard is citable.** Given the backfill has run, when `grep -l "' @kind" docs/system/diagrams/*.puml | wc -l` is evaluated, then it returns `112`; and `witness.bindingFor` returns a binding other than `{witness:'none'}` for every element.
11. **Research retrieves structurally.** Given a scout-touched path that resolves to an element carrying `source_spec:`, when `research` Step 0 runs, then the archived spec named by `source_spec:` appears in the retrieved set, reached by the structural pointer rather than term overlap.
12. **The amendment lands in precedence order and under budget.** Given the amendment, when the tree is inspected, then `seed.md` §4.8/§9/§12 and `CLAUDE.md` Article IX clause 10 carry the recall rule, `src/seed.template.md` and `src/CLAUDE.template.md` are byte-equal mirrors, `audit-baseline` exits 0, and `CLAUDE.md` is ≤ 38,800 chars and ≤ 39,000 bytes with no asserted ceiling raised.
13. **Flag-off is byte-identical.** Given `memory.architecture_map.enabled` is false or absent, when any Cycle 2 path runs, then behaviour is byte-identical to the pre-Cycle-2 baseline and no corpus read or write is attempted.

## Open questions

- None. The plan file specifies each of the six slices down to the call sites; scope, non-goals, and the budget constraint are stated there and verified against disk.
