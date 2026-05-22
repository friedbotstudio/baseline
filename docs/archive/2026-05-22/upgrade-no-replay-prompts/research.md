# Pattern Research — upgrade-no-replay-prompts

## Scope of this memo

The intake describes two failure modes:

- **A**: `_pending.md` and `_resume.md` get prompted every upgrade.
- **B**: post-`/upgrade-project` files (e.g., `seed.md`) re-stage on every subsequent upgrade.

**Failure A has only one credible fix** — add the two paths to the `NEVER_TOUCH` list at `src/cli/install.js:13-17` AND to `NEVER_TOUCH_PATHS` at `scripts/build-manifest.mjs:16-20`. No design alternatives worth surfacing. I cover it once in the "Orthogonal fix" section below.

**Failure B has a real design space.** Three candidates differ in where the reconciliation-marker state lives. An orthogonal question — *who writes the marker* — applies to candidates 1 and 2 alike. Candidate 3 collapses the question.

## Library APIs (context7)

**Not applicable to this work.** The fix touches Node core only — `node:fs/promises`, `node:crypto`, `node:path`, `node:child_process`. The single runtime dependency (`@clack/prompts@1.4.0`) is the TTY prompt library and is not in scope (the prompts that fire incorrectly are the symptom; the fix lives upstream of the prompt site). All other deps are dev-only (`@11ty/eleventy`, `semantic-release`, etc.). No new dependency is contemplated.

No context7 lookup was performed because no third-party API is being introduced or substantially used.

## Candidate 1: Extend per-target `.baseline-manifest.json` to v3 with per-file `reconciled_against`

- **Summary**: Bump the CLI-written per-target manifest from `v2` (bare-string sha values, `manifest.js:5`) to a `v3` shape where each file entry is `{sha256, reconciled_against?: <template_sha>, reconciled_at?: <ISO-8601>}`. Reconciliation state lives inline alongside the file's recorded install hash.
- **API references (current)**: N/A — all writes through existing `src/cli/manifest.js → saveManifest()` and `loadManifest()`. Schema change is internal.
- **Fits**: **Partial.** Aligns with the "single source of truth at `.claude/.baseline-manifest.json`" pattern that `doctor.js` and `merge.js` already assume. But conflicts with scout landmine #1 — `merge.js:154-157` currently overwrites `.baseline-manifest.json` with the shipped v3 manifest object (which carries `{sha256, tier}`, not `{sha256, reconciled_against}`). That overwrite is already wrong for `doctor.js:78` which assumes string-vs-string compare. Adopting candidate 1 forces fixing that bug in the same workflow (which the user has framed as a bundled-ship, so this is feasible — but expands the spec scope).
- **Tests it enables**: round-trip schema tests (load → mutate `reconciled_against` → save → load); doctor-still-works-after-upgrade tests; idempotency tests (upgrade → reconcile → upgrade-again → 0 prompts). All against the existing `tests/manifest.test.mjs` + `tests/doctor.test.mjs` + a new `tests/upgrade-idempotency.test.mjs` fixture.
- **Tradeoffs**:
  - **+** Discoverability: one file, one place to look for "what did the CLI think and what did the user reconcile?"
  - **+** No new doctor-side ignore rule needed (the marker lives inside the file doctor already reads).
  - **+** Forces fixing the latent v2/v3 inconsistency, which is independently broken.
  - **−** Conflates ship-time tier metadata (build-manifest output, copied into target by `merge.js:156`) with per-target user reconciliation state. The shipped manifest has `tier`; the per-target manifest has `reconciled_against`. If we use the same per-file shape for both, we either (a) ignore irrelevant fields per consumer, or (b) carry both fields everywhere. Adds cognitive load.
  - **−** Schema migration: existing installs have v2 manifests. The fix-this-once code path needs careful handling. Mitigation: `loadManifest()` can auto-upgrade v2 → v3 in memory on first read; the next `saveManifest()` call writes the new shape.

## Candidate 2: Separate `.claude/.baseline-reconciliations.json` file

- **Summary**: New on-disk artifact at `<target>/.claude/.baseline-reconciliations.json` siting parallel to `.baseline-manifest.json`. Schema: `{schema_version: 1, reconciliations: {<rel>: {baseline_version, reconciled_against_template_sha, reconciled_at}}}`. `merge.js` consults it; `/upgrade-project` (option A) or the CLI on next upgrade (option B) writes it. Doctor explicitly excludes the file from its `added` scan.
- **API references (current)**: N/A — all Node core.
- **Fits**: **Yes.** Aligns with the "per-target state under a known path" pattern (cf. `.baseline-prior/`, `.claude/state/upgrade/`). The `.baseline-manifest.json` semantics stay unchanged ("what was last installed") so audit/doctor consumers are not disturbed.
- **Tests it enables**: schema round-trip; merge-flow tests asserting "when marker matches new template hash, file is treated as NOOP not customized"; doctor tests asserting the new file is silently excluded from `added`.
- **Tradeoffs**:
  - **+** Cleanest separation of concerns — `baseline-manifest` is install-time truth; `baseline-reconciliations` is user-review truth. No conflation.
  - **+** Most reversible — if the design proves wrong, deleting the marker file restores prior behavior with no data loss.
  - **+** No version bump on the existing manifest; existing installs see the new file gracefully (absent → no recorded reconciliations → behaves exactly as today on first upgrade after fix lands).
  - **+** Doesn't depend on fixing the v2/v3 inconsistency (landmine #1) in the same workflow — that landmine can be carved out as a separate intake.
  - **−** Two files where one might do. Some readers will reach for `baseline-manifest.json` first when investigating "why did upgrade do X?" and miss the reconciliations file. Mitigation: doctor's output prints both file paths in its preamble.
  - **−** Doctor's `added` scan at `doctor.js:88-93` needs explicit exclusion. One-line change; covered by a new test.
  - **−** Should it be gitignored? Argument for: per-target ephemeral state, like `.baseline-prior/`. Argument against: committing it means team members share reconciliation history, which is genuinely useful for "did anyone already reconcile this?" Default to **committed** unless the spec finds a reason otherwise.

## Candidate 3: Stage-manifest lifecycle change — `/upgrade-project` marks RECONCILED, CLI cleans up

- **Summary**: No new file shape. Instead, `/upgrade-project` stops deleting the stage directory after reconciling — it updates each entry's `status` field from `PENDING` to `RECONCILED` and leaves the manifest in place. The CLI's `findPendingStage()` (already at `upgrade-tiers.js:66-77`) gains a sibling `findResolvedStages()` that reads `status: RECONCILED` entries. Before calling `dispatchCustomized` for a file, the CLI checks: is there a resolved stage whose `incoming_sha256` for this file matches the current new template hash? If yes, NOOP. Then the CLI deletes the resolved stage (or rolls it into a single archived state).
- **API references (current)**: Reuses `findPendingStage` shape (scout: `upgrade-tiers.js:66-77`).
- **Fits**: **Partial.** Reuses the existing stage-manifest infrastructure — no new on-disk artifact type. The `memory_session_start.sh:192-214` scan already understands stage manifests; future maintainers won't have to learn a new file shape. But changes ownership semantics: today the skill deletes the stage; in this design, the CLI does.
- **Tests it enables**: round-trip tests on stage manifest with `status: RECONCILED`; CLI consumes-and-deletes test; cross-version test where multiple stages stack up from interrupted upgrades.
- **Tradeoffs**:
  - **+** Zero new file shapes / no new doctor exclusions.
  - **+** Reuses existing infrastructure (stage manifest, status enum, findPendingStage scanner).
  - **+** Naturally handles the "user ran /upgrade-project across multiple upgrade cycles without re-running upgrade in between" case — multiple resolved stages all sit in `.claude/state/upgrade/` waiting for the next CLI run.
  - **−** Constitutional amendment to `.claude/skills/upgrade-project/SKILL.md` is larger — both relaxing the "no writes outside stage+LOCAL" rule AND changing the "delete stage when all RECONCILED" cleanup behavior.
  - **−** Stage directory lifetime stretches across upgrade cycles, which makes `memory_session_start.sh:192-214`'s nag ambiguous — does "N pending stages" mean PENDING or RECONCILED? The hook needs updating to filter on `status: PENDING` specifically.
  - **−** Less discoverable for the question "have I reconciled foo.md?" — answer requires scanning multiple stage manifests rather than reading one file.
  - **−** Doesn't address the v2/v3 inconsistency (landmine #1) at all — that bug persists.

## Orthogonal fix: NEVER_TOUCH expansion for `_pending.md` + `_resume.md` (failure mode A)

Two-line change in two files, lockstep:

```js
// src/cli/install.js
export const NEVER_TOUCH = Object.freeze([
  '.claude/project.json',
  '.claude/workflows.jsonl',
  '.claude/schemas/workflow-track.v1.json',
+  '.claude/memory/_pending.md',
+  '.claude/memory/_resume.md',
]);

// scripts/build-manifest.mjs
const NEVER_TOUCH_PATHS = new Set([
  '.claude/project.json',
  '.claude/workflows.jsonl',
  '.claude/schemas/workflow-track.v1.json',
+  '.claude/memory/_pending.md',
+  '.claude/memory/_resume.md',
]);
```

After this change, `obj/template/.claude/manifest.json` will declare both files as `tier: NEVER_TOUCH` (currently MECHANICAL), and `merge.js:87` will preserve the local file silently without consulting tier dispatch. The fix is orthogonal to candidates 1/2/3 — applies the same way regardless of which marker design is picked.

A regression-prevention test in `tests/manifest.test.mjs` (or a new `tests/never-touch-sync.test.mjs`) should assert that `install.js`'s `NEVER_TOUCH` set equals `build-manifest.mjs`'s `NEVER_TOUCH_PATHS` set. Otherwise the two lists can drift silently in future work.

## Orthogonal question: who writes the reconciliation marker?

For candidates 1 and 2 only (candidate 3 collapses this question):

- **Option A — `/upgrade-project` skill writes the marker**: requires amending `.claude/skills/upgrade-project/SKILL.md:114`'s "you SHALL NOT touch `.claude/.baseline-prior/`, the installed `.baseline-manifest.json`, or any other CLI state." Either narrowly relaxing the rule for the new marker file (preferred), or rewriting the entire constraint. Smaller change to other tests; touches the skill contract.
- **Option B — CLI writes the marker on next upgrade run**: preserves the skill contract entirely. CLI needs to detect "the user resolved my stage since I last ran." Detection mechanism: check whether `.claude/state/upgrade/<ts>/` exists for the most recent stage_ts the CLI staged. If absent → user ran `/upgrade-project` to completion → CLI reads the now-empty stage's prior manifest (cached how? candidate 1's manifest? a small `last_stage_ts` field?) and writes the marker. More moving parts; preserves more contracts.

**Recommendation on this sub-question**: Option A. The constitutional amendment is one bullet, easy to test, easy to reason about. Option B's "detect resolved stage" mechanism requires somewhere to remember "what was my last staged ts" — which is itself another new on-disk artifact, just spelled differently. Not a clear win.

## Recommendation

**Candidate 2 (separate `.baseline-reconciliations.json` file), with Option A (skill writes the marker).**

Reasoning:
1. Cleanest separation of concerns — manifest stays "what was installed"; reconciliations is "what user reviewed."
2. Most reversible — single file, no schema migrations on the manifest.
3. Doesn't entangle this workflow with landmine #1 (the v2/v3 manifest shape mismatch). That landmine is real and worth fixing, but probably as its own intake — bundling it inflates the spec scope from "fix replay prompts" to "fix replay prompts + redesign per-target manifest semantics."
4. Doctor exclusion is one line + one test.
5. Constitutional amendment to `/upgrade-project` SKILL.md is targeted: relax the SHALL NOT to allow writes specifically to the new reconciliations file.

**Plus the orthogonal NEVER_TOUCH fix** (failure mode A) shipped in the same commit — they're both bug fixes to the same flow, and the user has asked for one release.

**What would flip the decision toward Candidate 1**: if the spec's stakeholders decide the v2/v3 manifest inconsistency (landmine #1) must be fixed in this workflow — at that point we're already bumping the per-target manifest's shape, and adding `reconciled_against` to that schema is "while you're in there" work rather than a fresh decision.

**What would flip toward Candidate 3**: if discoverability of "scanned-stage history" is more valuable than discoverability of "per-file reconciliation state" — i.e., if the user often asks "what did I reconcile last quarter?" more than "is foo.md current?". The scout suggests neither question is asked often today, so I don't weight this heavily.

## Open questions

1. **Should landmine #1 (v2/v3 manifest shape mismatch at `.baseline-manifest.json`) be in scope for THIS workflow, or carved out?** My read: carve out — it deserves its own intake and a clean fix, not a side-effect of this work. But the user has framed this as a bundled ship; the spec phase will decide.

2. **Should `.claude/.baseline-reconciliations.json` be committed to git or gitignored?** Default suggestion: committed (team-shared reconciliation history is useful). If gitignored, the file behaves like `.baseline-prior/` — purely per-clone state.

3. **What's the test fixture shape for the end-to-end loop?** Two options: (a) a static fixture under `tests/fixtures/post-reconciliation/<slug>/` that simulates "the world after `/upgrade-project` ran" by hand-writing the reconciliation marker; (b) a programmatic helper that creates a fresh tmp tree, runs `threeWayMerge` to stage seed.md, hand-writes the marker as if `/upgrade-project` ran, then runs `threeWayMerge` again expecting NOOP. (b) is more thorough; (a) is faster to write. Spec picks.

4. **How does Option A's marker-write interact with `/upgrade-project --dry-run`?** Dry-run currently emits a unified diff without writing reconciled bytes. With Option A, it must also not write the marker (otherwise next CLI run would skip a file the user never actually reconciled). One-line conditional in the skill.

5. **Schema versioning for the new file**: pin `schema_version: 1`. If we ever need to evolve it, the loader can branch. Mention in the spec for forward-compat.
