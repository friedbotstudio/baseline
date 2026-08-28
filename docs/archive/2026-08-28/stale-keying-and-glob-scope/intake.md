# Separate what re-verifies a memory entry from where that entry surfaces

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

One field in the memory frontmatter schema, `governs:`, is read by two subsystems that want opposite things from it.

- **Staleness.** `.claude/hooks/lib/staleness.mjs` → `isStaleFromFields` treats a commit touching any path under an entry's `governs:` globs as evidence that the entry's subject moved, and marks it stale. **Narrow is better** — a narrow glob only fires when the thing the entry describes actually changed.
- **Surfacing.** `.claude/hooks/lib/scoped-memory.mjs:43` uses `governs:` as the path leg deciding which entries are shown to a phase. **Wide is better** — a wide glob reaches everyone who might trip over the thing the entry describes.

An entry whose evidence and audience are the same files is fine. An entry whose evidence is narrow and whose audience is broad has no correct value: every setting is wrong for one of the two readers.

**The concrete scenario.** `landmines/grep-reports-no-match-on-utf8-files-it-calls-binary` describes a silent trap — a control byte in a tracked text file makes `grep` and `git diff` report nothing, so a search answers "that symbol does not exist" when it does. It is `load_bearing: true`. Its body records the trap recurring four times, the fourth *inside a memory file, while its own author was writing the entry documenting it*, and states: it "existed, was `load_bearing: true`, and governed `.claude/**` when the trap recurred."

Its evidence is one file — `tests/control-bytes.test.mjs`, the gate that now catches it. Its audience is anyone editing any tracked text file.

On 2026-08-27 this entry was narrowed from `.claude/**, src/**, tests/**, docs/**` to `tests/control-bytes.test.mjs`, which is correct for staleness and wrong for surfacing. Four `PATH_LEG_BASELINE` counts in `tests/memory-scope-store-invariants.test.mjs` each dropped by one, naming the four source files that stopped seeing it. The narrowing was reverted, so the entry is back to churning on every unrelated test edit.

**It has been wrong in the other direction too.** `PATH_LEG_BASELINE`'s own comments record the `5f52ba2` repair: an entry's `governs:` "named four `.claude/skills/**` trees and not `.claude/hooks/lib/**`, so it surfaced at zero phases for a new writer added under hooks — the exact failure the entry itself describes." That repair was to **widen**. Same field, same session, opposite corrections.

**Measured, not inferred.** After the narrowings already applied this cycle, 4 of the original 9 entries still re-stale on an edit to any unrelated repo-root test file. All four are blocked by this conflict — each must stay wide to keep surfacing, which forces it to keep churning:

- `conventions/a-red-pre-existing-test-may-be-a-contract-conflict`
- `conventions/a-retrofit-guard-is-proven-by-re-breaking-what-it-guards`
- `conventions/census-and-budget-are-different-numbers`
- `landmines/grep-reports-no-match-on-utf8-files-it-calls-binary`

Measured with the live predicate — `governsMatches(splitList(governs), ['tests/some-unrelated-suite.test.mjs'])` — not by matching strings. An earlier substring check reported 5 of 9 because `.claude/skills/lib/tests/**` contains the characters `tests/**`; that reading was discarded.

**Why this matters beyond the four entries.** A stale queue that fires on every test edit stops distinguishing "go and check this entry" from "a test changed somewhere", and a signal that fires constantly is one nobody reads. That is the failure the witnessed-staleness work replaced commit-distance decay to avoid. Meanwhile an entry narrowed for quiet is an entry that no longer warns anyone. The backlog entry this workflow picks up, `tests-glob-restales-nine-entries-on-every-test-edit-4c7a`, prescribes narrowing as the fix — and that prescription is unsafe for at least one of its own nine, which is why it can only half-close today.

## Goal

A memory entry can be re-verified on the narrow set of files that would actually invalidate it, while still surfacing to everyone who works in the broad area it warns about.

## Non-goals

- **Not changing which entries exist, or what any entry says.** No curation, no rewriting bodies, no closing or opening entries.
- **Not changing the staleness predicate's rules.** Decay classes, the 30-day threshold, `STALE_EXEMPT` and `SUPERSESSION_DRIVEN` all stay as they are. This changes *what the predicate is pointed at*, never how it decides.
- **Not re-litigating the four `governs:` narrowings already applied this cycle.** They stand.
- **Not the flat-store sub-heading limitation.** The known-key guard needs an external key list and only a sharded store has one; a flat store still splits naively. Recorded, deliberately unaddressed here.
- **Not a migration.** Existing entries are not rewritten to adopt any new field except where an acceptance criterion below names them.

## Success metrics

- **Churn on the four blocked entries** — baseline: 4 of 9 re-stale on an unrelated test edit, target: 0 of 9, measured via `governsMatches(splitList(governs), ['tests/some-unrelated-suite.test.mjs'])` over each entry's staleness scope.
- **Surfacing reach, held** — baseline: the `PATH_LEG_BASELINE` counts in `tests/memory-scope-store-invariants.test.mjs` at the pre-change commit, target: no count decreases, measured via that test. A count that *rises* is legitimate and re-measured; a count that falls means an entry stopped reaching a reader.
- **Consumer installs unchanged** — baseline: current behaviour for every entry, target: byte-identical staleness verdicts and surfacing sets for every entry that adopts nothing, measured via the existing suite.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer) — raised the conflict on 2026-08-27 after the narrowing revert.
- **Reviewer**: Tushar Srivastava — sole approver at gate A.
- **Operator**: every Claude Code session running this baseline, and every downstream consumer install that takes the shipped template. There is no separate ops owner; the schema change reaches consumers through `scripts/build-template.sh`.

## Constraints

- **Shipped-contract change, additive only.** Widening a guard is a fix; narrowing one breaks consumer installs silently. An entry that adopts nothing must behave exactly as it does today, in both readers.
- **A new frontmatter field must be liftable.** `LIFTABLE_FIELDS` in `.claude/skills/memory-index/lift-fields.mjs` is an allowlist; a field outside it strands in entry bodies, where `strandedFieldBullets` then refuses every sweep mode via the `assertRelifted` precondition.
- **Known surface**: `.claude/hooks/lib/scoped-memory.mjs`, `.claude/hooks/lib/staleness.mjs`, `.claude/skills/memory-index/lift-fields.mjs`, `.claude/skills/memory-index/scope-narrow.mjs`, `.claude/memory/README.md`, `tests/memory-scope-store-invariants.test.mjs`. The Open questions below note that this list is not confirmed complete.
- **`PATH_LEG_BASELINE` is a census, not a budget.** If the change moves it, re-measure and name the commit that moved it. Do not defend the old numbers, and do not re-measure a budget to its current value.
- **`applyNarrowing` is the sanctioned writer for entry frontmatter.** Article IX.3 reserves direct canonical-memory writes to `/memory-sync`. Any entry edit must leave body bytes, `verified-at` and `last-touched` unchanged — those two fields are the staleness witness, and rewriting them erases the very churn this work is measured by.

## Acceptance criteria

1. Given `landmines/grep-reports-no-match-on-utf8-files-it-calls-binary`, when a commit touches an unrelated repo-root test file, then the staleness predicate does not mark it stale.
2. Given that same entry, when scoped memory resolves which entries surface for a write under `.claude/**`, `src/**` or `docs/**`, then it is still included — and the four `PATH_LEG_BASELINE` counts it contributes to do not fall.
3. Given each of `conventions/a-red-pre-existing-test-may-be-a-contract-conflict`, `conventions/a-retrofit-guard-is-proven-by-re-breaking-what-it-guards` and `conventions/census-and-budget-are-different-numbers`, when a commit touches an unrelated repo-root test file, then the staleness predicate does not mark it stale, and each still surfaces to the phases it reaches today.
4. Given an entry that declares only `governs:` and adopts no new field, when either the staleness predicate or the surfacing filter reads it, then the result is identical to the result before this change.
5. Given the live store after this change, when the full test suite runs, then `tests/memory-scope-store-invariants.test.mjs` passes with every `PATH_LEG_BASELINE` count either unchanged or re-measured upward with the moving commit named in a comment beside it.
6. Given a memory entry carrying the new field in its frontmatter, when a sweep mode runs, then `assertRelifted` does not refuse — the field is liftable and does not strand in the entry body.
7. Given the four entries in criteria 1 and 3, when `tests-glob-restales-nine-entries-on-every-test-edit-4c7a` is evaluated for closure, then 0 of the original 9 entries re-stale on an unrelated test edit.

## Open questions

- **Which other `governs:` readers are surfacing-shaped and which are staleness-shaped?** Six modules beyond the two named above read `governs:` — `.claude/hooks/lib/governed-memory.mjs`, `.claude/hooks/process_lifecycle_guard.mjs`, `.claude/skills/memory-index/resolve.mjs`, `.claude/skills/memory-index/constraints.mjs`, `.claude/skills/workspace/queries.mjs`, `.claude/skills/workspace/refs.mjs`. Each must be classified before the split is complete, because a surfacing-shaped reader left on the staleness field silently keeps today's wrong behaviour. This is a scope question, not a design question: the answer changes how many files the change touches. `/scout` should resolve it.
- **Does `scope:` already carry part of the surfacing intent, and does the split make the two fields redundant?** Surfacing has a phase leg (`scope:`) and a path leg (`governs:`). If a separate surfacing-path field is added, the relationship between it and `scope:` needs stating so a future curator knows which one to reach for.
