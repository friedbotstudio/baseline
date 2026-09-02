# Pattern Research — gate-fidelity

## Prior art (retrieved)

`retrieve.mjs`: 247 sources scanned, 209 term hits, **0 structural hits** — no `docs/system/` element governing the touched paths carries a `source_spec:`, and `structuralUnresolved` is empty, so the structural lane is genuinely silent rather than broken. Two term hits carry real signal; the rest are common-word overlap.

**`docs/archive/2026-08-17/unify-epic-heading-grammar/spec.md`** (`via: terms`, score 9) — the precedent, and it answers three of this memo's five axes outright. Reused rather than re-derived:

- **D1** — the canonical home is `.claude/skills/lib/`, because both consumers import *downward* into it and neither gains an edge on the other. Exporting the grammar from one consumer would have created a dependency that does not exist.
- **D4** — two entry points, not one normalizing entry point. A single entry with an optional prefix silently widens what counts as a match for a caller that scans every line.
- **D5 — the resolution rule this work needs.** Where readers disagree, the **reader-facing** one wins, and the resulting edge deltas are enumerated and pinned individually. That spec did not average the three grammars or pick the strictest; it picked the one whose output reaches a human and then wrote down every case that changed.
- **D6** — the shared regex is non-global; repeated scanning builds a fresh copy. A shared global regex used with `.test()` alternates true/false across calls.

**The precedent's shape is the finding, and it is not the shape this intake assumed.** `unify-epic-heading-grammar` removed divergence by migration — extract, repoint, pin — and built no detector. Its three consumers have diverged zero times since. That is evidence that unification works and evidence that it was never guarded: nothing would catch a fourth consumer declaring its own copy tomorrow.

**`docs/archive/2026-08-24/consumer-defects-2026-08-24/spec.md`** (`via: terms`, score 10) — same class, same origin (defects reported from a consumer install). Confirms this is a recurring lane rather than a one-off.

**Delta derived below:** everything about the engine itself. The precedent covers where shared code lives and how to resolve a disagreement; it covers nothing about detecting the next one.

## Libraries

**None.** This work needs no third-party dependency. The engine reads files, calls exported functions, and compares values — `node:fs`, `node:path` and `node:test`, all already in use. No fetch was made, because inventing a dependency to satisfy the current-docs rule would be the wrong outcome (seed.md §2.5 makes VI.5 an outcome mandate, not a tool mandate). If the spec introduces a schema validator for `slices[].acs`, that claim needs verifying then; nothing here does.

---

## Candidate A: Reader-agreement over an adversarial fixture

- **Summary**: Register every reader of a given artifact section. Run all of them over each fixture row. Fail when any two disagree. No expected value is written down anywhere.
- **API references (current)**: none required.
- **Fits**: Partly. It matches how the two live bugs were found — by noticing two readers answer differently.
- **Tests it enables**: One test per fixture row asserting all registered readers return the same value. Cheap to write, and nobody has to adjudicate what "correct" means.
- **Tradeoffs**:
  - **Fatal gap, measured.** Scout row 9 — `closure-check.mjs` matching the closure stamp against the whole file instead of the frontmatter block — has **exactly one reader**. There is nobody for it to disagree with, so agreement reports clean on the most serious finding in the report. That single fact disqualifies agreement as the only comparison.
  - Scout also measured that all four Acceptance-criteria readers agree on every real spec in `docs/specs/`. Agreement is silent whenever readers are wrong together, which is a live condition here, not a hypothetical.
  - Cheap, and it needs no judgment call per row. That is its real appeal and it is not nothing.

## Candidate B: Golden-value engine, readers registered as exported functions

- **Summary**: Each fixture row is a small adversarial document plus the expected parse result for each section it exercises. Every reader is registered as an exported function reference and asserted against the expected value. Disagreement between readers falls out for free — at most one of two differing answers can match golden.
- **API references (current)**: none required.
- **Fits**: Yes, and it is the only candidate that covers all nine measured divergences. It also inherits the precedent's D5 rule directly: the expected value *is* the adjudication, written down once instead of implied.
- **Tests it enables**:
  - Per-row, per-reader assertions — a failure names the row, the reader, the expected value and the actual one.
  - The anti-vacuity assertions AC-12 requires (below), which agreement cannot express because it has no notion of "measuring nothing".
  - A "second declaration site" grep in the shape of `tests/reentry.test.mjs`, which already proves that pattern works in this repo.
- **Tradeoffs**:
  - **Requires exports that do not exist today.** `spec-lint`'s `sliceOwnershipInSpec` is not exported; `drift_check`'s `AC_ROW_RE` is a module-level const. Registering readers means widening the export surface of live modules. That is additive and safe, but it is a real diff across several files, and `spec-shippability-review` will see every new export.
  - **Someone has to decide the expected value for nine rows.** That is the honest cost, and the precedent's D5 gives the rule for making each call: where readers differ, the one whose output reaches a human wins, and every resulting delta gets enumerated.
  - **It ships red unless the fixes land with it.** Nine rows fail on day one. Intake ACs 1-9 already commit to those fixes, so this is scheduling rather than a defect — but a partial landing would reproduce `spec-lint-fixture-omits-system-delta-3f7a`, a red test nobody reads.

## Candidate C: Golden-value engine, readers registered as declared patterns

- **Summary**: Rather than importing readers, the engine holds a table of each reader's pattern and applies it itself. No consumer module changes.
- **Fits**: **No, and it should be rejected outright.** A table of patterns inside the engine is a second declaration of every grammar it describes, kept in step with the real one by nothing. The engine would go green while a consumer's actual regex drifts away from the copy the engine tests — which is precisely the defect this workflow exists to close, rebuilt inside the mechanism meant to close it.
- **Tradeoffs**: It is genuinely cheaper and touches no consumer. That is the whole argument for it, and it is not enough. Named here because the brief asked for it to be weighed, and because the cheapness is a real temptation later in implementation.

---

## Recommendation

**Candidate B**, with three design commitments the spec should carry.

**1. Fixture location: `.claude/skills/lib/conformance/`.** Verified: `audit.mjs:109-117` admits any `SCOPE_FILE.startsWith('.claude/')`, so a fixture there is inside the `--file=` allow-list and a scoped run cannot silently skip the check. `.claude/skills/lib/` already ships (7 manifest entries), so the shipped audit caller reaches it and the repo-root test reaches it too. This is the only location that satisfies both callers; scout was right that the constraint decides more than it looks.

**2. Unify where it is nearly free, detect everywhere.** The slice grammar has three readers and one is already correct — extracting it to a lib module on the D1/D4 shape is a small diff and removes the divergence rather than merely reporting it. The other contested grammars stay where they are and are asserted in place. Unification and detection are not alternatives: the precedent proves unification holds, and proves nothing guards it.

**3. Anti-vacuity, derived from the three backlog entries, all three of which are prior art in exactly this failure:**

- `coverage-alarm-fixture-derives-zero-elements-9a3c` — the fixture returned `{elements: 0}` while the live corpus had 16 gaps. **Implication:** assert the row count is above a floor *before* asserting anything about parses. A zero-row fixture must fail, not pass.
- `anchor-digest-is-vacuous-for-exportless-files-3f7c` — 25 of 60 elements carried the sha256 of the empty string. **Implication:** a reader returning a degenerate value (empty array, empty string, null) for every row must be reported as unmeasured, not as agreeing.
- `claude-skills-lib-tests-is-executed-by-nothing` — a test directory beside a security-relevant module that no glob reaches. **Implication:** the test lives at the repo root under `tests/`, ungated by any env flag, and the engine asserts that both callers actually invoked it. Note the irony worth stating in the spec: this backlog entry names `.claude/skills/lib/` as the stranded directory, and this work puts new code there.

**What would flip the recommendation.** If registering readers as function references turns out to require exporting something that cannot be safely exported — a closure over module state, or a function whose export changes `spec-shippability-review`'s verdict — then the fallback is Candidate B for every reader that can be imported and Candidate A for the remainder, with the un-importable readers named in the spec as a known coverage gap. It is not Candidate C. A declared-pattern table is worse than an admitted gap, because a gap is visible and a stale copy is not.

## Open questions

- **The expected value for each of the nine rows.** Applying the precedent's D5 rule mechanically gives: the titled slice heading resolves (`pinned-spec` wins, it faces the drift report a human reads); the prose-quoted heading yields the real table's ids (the anchored readers win); the AC id in a later column is **not** an AC of that row (`drift_check` wins); `## Design  calls` resolves (the hook wins, it is the enforcing side); `### Behavior #12b` — genuinely unclear, and the only one of the six where D5 gives no answer, since both readers feed machine checks. The spec author decides that one.
> **RESOLVED 2026-09-03 by the human, before `/spec`.** Two of the four questions below were put to the user as load-bearing forks (CLAUDE.md XI.12); both took the recommended option.
>
> - **`slices[].acs`** — publish the required shape, add a writer-side check, cover both shapes as fixture rows. **The four prose-shaped state files on disk are NOT migrated.** Two of those epics are open, and rewriting state that in-flight work reads is a risk this cycle does not need to take.
> - **`closure-check.mjs` (scout row 9)** — **fixed in this cycle**, not deferred. It reads the frontmatter block instead of the whole file. `/security` still reviews it and may say more. The mechanism ships with nothing known-broken behind it.
>
> The remaining two questions below are engineering calls, decided in main context and recorded in the spec's `## Decisions` section rather than asked.

- **How far the `slices[].acs` fix goes.** Three shapes were considered. Folding it into the engine as a third artifact type covers the read side — golden values for what `sliceOwnershipInState` returns given ids versus prose. It does **not** reach the writer, and one writer is Claude executing a paragraph by hand. The paragraph gets fixed by the documentation work already in scope; whether `retriage.mjs:55` also gains a shared assert, and whether the four prose-shaped state files on disk get migrated, is a scope call for the spec. Migrating them touches live epic state for two open epics.
- **Whether `closure-check.mjs` (scout row 9) is fixed here or referred to `/security`.** It is a commit-path check satisfiable by prose. It is in scope as a fixture row either way; whether the fix rides this cycle is the question, and the answer affects whether the engine ships green.
- **Whether the "one declaration site" grep applies to the newly extracted slice grammar only, or to every contested grammar.** The narrow version is enforceable today. The broad version asserts something no reader currently satisfies.
