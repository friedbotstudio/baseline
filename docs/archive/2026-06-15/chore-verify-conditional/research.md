# Pattern Research — fix vitest reporter flag + close docs-only chore verify trap

Two decisions for the spec author: **(A)** the mechanism that makes chore-`verify` conditional, and **(B)** the explicit signal distinguishing a docs-verifying `test.cmd` from one that can't. Part 1 (the reporter flag) has no design choice — only an API fact to confirm, recorded first.

## Part 1 fact-check — vitest v4 reporters (context7-verified)

- `vitest@4.1.6` — `--reporter` CLI option — context7 `/vitest-dev/vitest/v4.1.6` (`docs/guide/migration.md`, `docs/guide/reporters.md`, `docs/guide/cli.md`).
  - **`basic` is removed in v4.** Migration doc verbatim: *"The `basic` reporter has been removed in Vitest v4, as its functionality is now equivalent to configuring the `default` reporter with `summary: false`."*
  - Valid built-in reporters in v4: `default`, `dot`, `verbose`, `tree`, `tap`, `tap-flat`, `json`, `junit`, `hanging-process` (the exported set is `DefaultReporter, DotReporter, JsonReporter, VerboseReporter, TapReporter, JUnitReporter, TapFlatReporter, HangingProcessReporter, TreeReporter`).
  - CLI example confirming `dot` is valid: `vitest --reporter=dot --reporter=default`.
- **Conclusion:** `--reporter=dot` (intake's proposal) is valid in v4. The *closest literal* replacement for `basic` is `default` with `summary: false`, but for a concise non-interactive CI line `dot` is the right call (one char per test, exit code intact). Recommend `--reporter=dot`.

---

## Decision A — mechanism for conditional verify

### Candidate A1: in-skill conditional (move verify into the chore skill's conditional block)
- **Summary**: Demote chore Step 4 (inlined verify) from the *mandatory* block to the *conditional* block, with one trigger: run verify UNLESS the diff is pure-docs/prose AND `test.cmd` cannot verify docs (Decision B signal). Mirrors exactly how `simplify`/`integrate`/`document` already work (`chore/SKILL.md:50-73`).
- **Fits**: **Yes** — anchored to scout "Patterns in use here": the chore skill already inspects its own diff to decide conditional phases; verify joins that same in-skill trigger logic. Leaves the 4-node chore DAG (`chore → memory-flush → grant-commit → commit`) untouched.
- **Tests it enables**: a chore-track behavior test asserting (i) pure-docs diff + behavior-suite signal → verify skipped (no FAIL stamp, proceeds to archive/memory-flush); (ii) code-touching diff → verify runs; (iii) pure-docs diff + structural signal → verify still runs. No fixture churn.
- **Tradeoffs**: the skip decision lives in skill prose (the model executes it), like the existing conditionals — auditable via the mandatory end-of-chore skip summary, but not a hook-enforced gate. Acceptable: the existing simplify/integrate/document conditionals already rely on the same discipline.

### Candidate A2: verify DAG node + `/triage` exception
- **Summary**: Add a `verify` node to the chore track in `workflows.jsonl`; `/triage` writes it into `workflow.json → exceptions` when it judges the work pure-docs on a behavior-suite repo.
- **Fits**: **No** — contradicts two scout findings: (1) `/triage` has no write_set/diff/`test.cmd` inspection today (it would need new capability to classify pure-docs *before the edits exist*), and (2) verify is not currently a DAG node. It also **breaks `tests/byte-equivalent-migration.test.mjs:86-90`** (golden chore fixture expects the 4-node DAG) and changes the chore DAG shape.
- **Tests it enables**: a triage-path test — but at the cost of fixture rewrites and a new triage diff-classification surface that the intake non-goal ("no heuristic auto-classification") pushes against.
- **Tradeoffs**: more moving parts, breaks an invariant fixture, and asks `/triage` to predict the write_set before any file is written. Higher blast radius, worse fit.

**Note on the intake's wording.** The intake said "/triage records the exception" — research finds that mechanism (A2) is the worse fit. The chore skill, not triage, owns conditional-phase decisions because only it sees the actual diff. Recommend the spec correct the mechanism to A1.

---

## Decision B — explicit signal (no heuristic; non-goal-compliant)

The decision the chore skill must make: *can `test.cmd` meaningfully verify a docs-only change?* The baseline audit (structural, whole-repo) → **yes**, keep verify. A vitest unit suite (behavior) → **no**, skip verify for docs-only. The signal must be explicit config and default conservatively (absent → today's behavior = verify always runs).

### Candidate S1: `project.json → test.kind: "structural" | "behavior"`
- **Summary**: One key describing the nature of `test.cmd`. `structural` = exercises the whole repo incl. docs/governance (the audit); `behavior` = code-only suite. Chore skips verify on a pure-docs diff **only when `test.kind === "behavior"`**. Absent → treat as `structural` (verify always runs) = backward-compatible; the baseline (audit) needs no new setting.
- **Fits**: **Yes** — describes `test.cmd` once, where `test.cmd` already lives (`project.json → test`). `/init-project`'s recommender, which already chooses the command, sets `test.kind: "behavior"` when it wires a unit runner — pairing naturally with the Part 1 reporter fix.
- **Tests it enables**: assert default-absent → structural → verify runs; assert `behavior` + pure-docs → verify skipped. `derive-counts` unaffected (no new skill/hook/command/track).
- **Tradeoffs**: a new public config key (documented + added to `obj/template/.claude/project.json`). Two-valued enum is YAGNI-clean; resist adding more values now.

### Candidate S2: `project.json → test.covers_docs: boolean`
- **Summary**: A direct boolean for the exact question. `false` → docs-only chores skip verify. Absent → `true` (conservative; verify runs).
- **Fits**: Yes, and it's the most literal phrasing of the decision. But it bakes "docs" into the key name when the real axis is "what does the suite cover" — less reusable, and a double-negative default (`absent=true=covers`) reads awkwardly.
- **Tradeoffs**: narrower semantics than S1; if a future decision needs the structural/behavior distinction it'd be re-derived. Slightly worse naming ergonomics.

### Candidate S3: chore-scoped flag `chore.skip_verify_on_docs_only: boolean`
- **Summary**: Put the knob under a `chore` config block instead of `test`.
- **Fits**: No — it describes a *policy* ("skip") rather than a *fact about test.cmd*, pushing the judgment to the config author instead of deriving it from the suite's nature. Couples the knob to one track; the structural/behavior fact is really a property of `test.cmd`, not of chore.
- **Tradeoffs**: leaks mechanism into config naming; least principled.

---

## Recommendation

- **Part 1**: change `--reporter=basic` → `--reporter=dot` in `claude-automation-recommender/SKILL.md:45`.
- **Decision A → A1** (in-skill conditional). Best pattern-fit, zero fixture churn, no new triage capability. Correct the intake's "/triage records the exception" wording in the spec.
- **Decision B → S1** (`test.kind: "structural" | "behavior"`, absent → `structural`). Most principled, backward-compatible, and pairs with the recommender already choosing the command. The recommender should additionally emit `test.kind: "behavior"` when it generates the vitest command (ties Part 1 + Part 2 together) — confirm this scope addition with the reviewer at /spec.

**What would flip A:** if the reviewer wants a hook-enforced (not prose-enforced) verify-skip, A2 becomes attractive despite the fixture cost — but that's a larger change than the trap requires.
**What would flip B:** if the reviewer rejects a new public `project.json` key entirely, fall back to S2's narrower boolean, or scope the skip to "pure-docs diff → always skip verify" (rejected here because it loses the baseline audit's genuine docs coverage).

## Open questions

1. **Recommender scope** — should this cycle also make the recommender emit `test.kind: "behavior"` alongside the vitest command, or is that a follow-up? (Recommend: include it — it's what makes a fresh vitest install actually benefit from the trap fix.)
2. **`test.kind` default semantics** — confirm absent → `structural` (verify always runs) is the desired conservative default, vs absent → `behavior`. (Recommend: `structural`, so existing installs and the baseline don't change behavior.)
3. **pure-docs classification** — confirm the chore skill reuses its existing diff-inspection (the simplify/integrate/document trigger logic) to classify "pure-docs/prose only", with any code/config/script path flipping it to non-docs. Define the doc path set in the spec (e.g. `*.md`, `docs/**`, prose-only).
