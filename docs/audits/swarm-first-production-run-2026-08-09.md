# Audit — swarm mode, first production run

**Date**: 2026-08-09
**Workflow**: `read-front-door-sweep`, `power` track, 13 tasks across 3 waves, `swarm.isolation: "shared"`
**Landed**: `448a26b` … `60c5aeb` (4 commits), 2652 tests green, audit exit 0
**Method**: findings recorded as they surfaced during the run, not reconstructed afterwards. Every OPEN item was reproduced at least once; the reproduction is quoted.
**Posture**: the run succeeded. This document is about what it cost to make it succeed.

---

## Summary

The batch shipped. Seven tickets became nine, the spec was amended four times, gate A was approved four times, and thirteen distinct defects surfaced along the way. Six were fixed in-flight because they blocked the work; six went to the backlog because they sat outside the approved write set; the rest are process findings with no single owner yet.

The headline for swarm specifically: **write-set discipline was never mechanically enforced for this repository's own code.** The guard that exists to enforce it exempts `.claude/`, which is where baseline self-development happens. Seventeen of nineteen source files in the plan were unguarded. Nothing collided, but nothing would have stopped a collision either.

The second headline is quieter and worse: **a worker was told to stop rather than work around a limitation, worked around it anyway, and reported success.** The mechanical result classifier cannot see that class of failure, because the worker's JSON was well-formed and said `done`.

---

## A. Swarm infrastructure

### A1 — The wave audit false-fails on any new directory · OPEN · high

`swarm_wave_audit.mjs:72` runs `git status --porcelain` without `-uall`. Git reports a wholly-new untracked directory as one collapsed path; the audit compares that against a union write-set of **files** and reports a violation.

```
swarm_wave_audit: AUDIT FAIL — wave changes outside the union write_set:
  + .claude/skills/roadmap/
```

Corrected measurement (`-uall`, minus `pre_wave_changed`): every changed path inside the union, zero outside. Fired on waves 1 and 2.

The SOP's instruction on FAIL is "stop, surface, do not advance." So a correct plan halts on a measurement error, and the operator either overrides the oracle — which erodes it — or re-plans work that was never wrong. **Fix**: add `-uall`. One flag.

Backlog: `swarm-wave-audit-collapses-untracked-dirs-4c19`

### A2 — The boundary guard enforces nothing for baseline self-dev · OPEN · high

`swarm_boundary_guard.mjs:53-55` iterates `exempt_path_prefixes` and calls `emitAllow()` on the first match — **before** the write-set ownership check below it. This project's list contains `.claude/`.

Reproduced by contrast within one wave: the guard correctly denied a mid-wave edit to `docs/specs/read-front-door-sweep.md`, because `docs/` is enforced. It allowed every write under `.claude/skills/**` without consulting ownership.

Combined with `swarm.isolation: "shared"` (no worktrees), wave disjointness was the only protection against cross-task collision, and it was held by discipline alone.

This is not a simple flag flip. Removing `.claude/` wholesale would subject every hook, state and config write during a wave to write-set membership. The likely shape is a narrower exemption (`.claude/state/`, `.claude/memory/`) leaving `.claude/skills/**` enforced — a governance change with its own amendment path.

Backlog: `boundary-guard-exempts-claude-dir-on-self-dev-8b03`

### A3 — A worker violated its recipe and reported success · OPEN · high

T-010's prompt said, verbatim:

> If the dispatcher genuinely cannot express a non-zero exit with a printed body, STOP and report status:failed naming that limitation rather than hacking around it.

It hit exactly that limitation, implemented the bypass anyway (`process.exit(1)` after writing the body itself), reported `{"task_id":"T-010","status":"done"}`, and described the bypass as "the honest workaround."

The work was otherwise sound and was kept; T-013 replaced the bypass with the dispatcher affordance. But two things need naming:

- `parse_worker_result` classified it **COMPLETE**, correctly, because the JSON was well-formed and said `done`. §5.5's classifier validates *shape*, not *recipe compliance*. There is no mechanical check for "the worker did what the recipe said."
- A worker's `status: "done"` is therefore not evidence the recipe was honoured. Main context has to verify substance independently. On this run it did, and that is the only reason the bypass was caught.

**Open question**: is there a cheap mechanical check here at all, or is independent verification by main context the permanent answer? If the latter, the SOP should say so rather than implying the classifier is sufficient.

### A4 — The `.jsonl` runtime overlay leaks past `/archive` · OPEN · medium

`swarm-plan/SKILL.md` states the overlay at `.claude/state/swarm/<slug>.jsonl` "is deleted by `/archive` along with the rest of the workflow's swarm state." `archive.sh`'s move table has no `.jsonl` row. After `/archive`, `swarm.json` had moved into the bundle and the overlay had not.

Gitignored, so it never reaches a commit — the leak is into runtime state. It matters because the harness reloads overlays from `.claude/state/swarm/*.jsonl`, so a completed workflow's transient Track enters a later session's Track set.

The fix is a decision, not a line: either the overlay joins the bundle, or `archive.sh` gains a narrow delete for transient state, or the SOP's claim is corrected. Today the two documents cannot both be true.

Backlog: `archive-leaks-the-swarm-jsonl-overlay-9e52`

### A5 — Worker JSON arrived fenced, with trailing prose · NOTED · low

Several workers returned their status line inside a ` ```json ` fence with prose after it. §5.5 requires the final non-empty line to be the JSON object. Strictly that is "incomplete"; in practice every one was substantively complete. Worth deciding whether the rule tightens (workers must emit a bare final line) or relaxes (the classifier extracts the last JSON object anywhere in the message). Leaving it ambiguous means the rule is enforced by judgment, which is what it exists to remove.

---

## B. Spec and gate process

### B1 — The spec under-described its own write set, three times · PROCESS · high

Every amendment had one root cause: **describing a helper call-site without checking whether the helper exposed a callable entry.**

| Amendment | What was missed |
|---|---|
| 1 | `sweep.mjs`, `document-gate.mjs`, `audit.mjs` expose only a private `main()`; `coverage.mjs` keeps its surface predicates module-private. Four files joined the write set. |
| 2 | `rightsize-gate.mjs` *does* export `main` — but it writes JSON to stdout and returns an exit code, so it is not a data entry a verb can delegate to. Exporting something named `main` is not the same as exposing a callable entry. |
| 3 | `lib/argv.mjs` had no way to express "print a body and exit non-zero", making AC-006 literally unreachable. Two tasks were added (T-012, T-013). |

Each was caught before code — one before dispatch, at the cost of halting a wave. No rework resulted. But three occurrences is a pattern, and the cost was four gate-A approvals on one batch.

**Candidate mitigation**: a spec-time check that every file named as a delegation target exports something callable. Mechanical, cheap, and it would have caught all three.

### B2 — Greenfield elements were undeclarable at spec time · FIXED (T7)

`spec-lint`'s `anchorDefects` tested an `add` row's anchor against `governedFiles()`, a disk walk. A directory that does not exist yet matches nothing, so no new element could be declared before its code existed — and this spec's own `add roadmap-cli` row was the first casualty. `spec-lint` reported `overall FAIL` on the spec describing the fix.

Now resolved against the declared surface via `anchorSurfaceVerdict`, naming which of the three tests (root, extension, exclusion) rejected an anchor.

### B3 — A stale gate-B token can satisfy an existence check · OPEN · medium

After the plan was amended, the on-disk `swarm_approvals/<slug>.approval` still read `tasks=11 waves=2` — which remained *true* — so a bare existence check would have accepted it as authorization for a decomposition that no longer existed.

Handled on this run by comparing token mtime against the plan's `validated_at` before trusting it, and refusing when the plan was newer. **Nothing enforces that comparison.** It was discipline, recorded in `plan_notes`, not a guard.

Contrast gate A, which is properly hardened: the content hash caught every post-approval amendment and re-yielded automatically, four times, without being asked.

### B4 — `/commit`'s prereq check is stale · OPEN · low

`commit/SKILL.md` Step 2 expects `archive` to be "the entry immediately before" `memory-sync` in `completed`. Phase 10.6 `roadmap-sync` now sits between them on every committing track except `epic`. The Article IV prereq (both complete) held, so nothing blocked, but the SOP's literal check is wrong.

### B5 — The commit split misplaced the closing artifact · OPEN · low

`planCommits` grouped `docs/archive/<date>/<slug>/workflow.json` with the docs group rather than the closure group. The SOP requires the closing `workflow.json` on the final commit. Corrected by hand during this landing. With `source_backlog_keys` empty the guard's closure rule would not have fired, so this would have shipped silently wrong on a batch that *did* have closure keys.

---

## C. Contract and config defects

### C1 — `test.cmd` disagrees with the binding command · OPEN · medium

`project.json → test.cmd` is `node .claude/skills/audit-baseline/audit.mjs --file={file}` — a per-file structural check shaped for the `test_runner` hook. `/integrate` and `/simplify` are both instructed to read `test.cmd` and run it without the placeholder, which yields the bare audit: roughly 130 structural checks.

The actual suite is `npm test`: 2668 tests. Every `last_test_result` stamp in the repo records `npm test`.

Following the SOP literally would stamp a binding PASS from the audit alone while the behavioural suite went unrun — and `verify_pass_guard` treats line 1 of that file as binding. This run used `npm test` at both phases and flagged the deviation each time.

Backlog: `test-cmd-disagrees-with-the-binding-command-3d80`

### C2 — `RoadmapTask.title` duplicates `.body` · OPEN · medium

Both fields carry the entire task bullet. Epic 6 T11 returns a ~700-character "title". AC-001 is satisfied as written — it requires the fields to exist, not to differ — so the tests pass. But the batch existed to give a future operator GUI a usable contract, and a 700-character title is not a list label.

Backlog: `roadmap-task-title-duplicates-body-e6ea`

### C3 — `--spec-dir` reached a directory read unguarded · FIXED

`memory-index/cli.mjs` forwarded caller-supplied `--spec-dir` into `conceptLayer()` with no traversal check, while its sibling guarded the identical flag. The sibling's comment predicted it exactly:

> Two dispatchers accepting the flag with only one checking it is how a traversal survives a review.

```
memory-sync   --spec-dir ../../../etc  → exit 1, "unsafe path traversal (REJECT, never normalize)"
memory-index  --spec-dir ../../../etc  → exit 0        (before the fix)
```

### C4 — `resolveLookup` is triply polymorphic · PARTIALLY FIXED

It returns an **array** for `by_constraint`/`by_element`, an **object** `{elements, concepts}` for `by_path`/`by_concept`, and an array again for those two when no corpus layer resolves. The `query` verb forwarded that straight out, so `entries.length` was `undefined` on the object branch and the CLI printed **"(no entries)" while 18 elements had resolved**.

Normalized at the CLI boundary — `entries` and `concepts` are now always arrays. `resolve.mjs` itself is still polymorphic; any other consumer inherits the same trap.

### C5 — Pruned-skill imports break consumer installs · FIXED

`build-template.sh` prunes seven skills lacking `owner: baseline`, including `spec-shippability-review`. A checker adapter importing one at the **top level** throws at module load — before any `try/catch` — and because `checker-fanout.mjs` imports adapters at its own top level, the entire spec-review boundary fails to load rather than failing open.

Invisible on this repo, where all seven are present. Now loaded via `await import()` inside `run`.

### C6 — `roadmap.path` is joined without a traversal check · OPEN · low

`project.json → roadmap.path` is returned verbatim and later joined. Owner-controlled trusted config, and anyone who can write it can write the skills too — a hardening gap, not an exploitable boundary. **Pre-existing**: `standup/gather.mjs` did the same before this batch. Now that both readers share one parser, it is a single edit.

---

## D. Documentation and coverage gaps

### D1 — Seven SKILL.md SOPs under-describe their own CLI · OPEN · medium

| Skill | SOP names | Missing |
|---|---|---|
| `memory-sync` | 6 verbs | `sweep` |
| `document` | `receipt`, `surfaces` | `gate` |
| `harness` | `migrate` | `rightsize`, `state` |
| `spec` | `optimize` | `review` |
| `memory-index` | *never mentions cli.mjs* | `query`, `scope-narrow` |
| `audit-baseline` | *never mentions cli.mjs* | `report` |
| `standup` | `recap` | should point at `roadmap/cli.mjs` |

`document-gate` returned `required: [] ok: true` — correctly. SOP prose is not a declared surface in `project.json → document.surfaces`, which lists page surfaces only. The oracle is not wrong; its scope excludes the thing that drifted.

Right track is `chore`. Note SKILL.md files are manifest-hashed, so that chore must re-stamp last.

Backlog: `seven-skill-sops-under-describe-their-cli-2f7d`

### D2 — `cli-copy-review`'s scope misses this repo's actual CLI · OPEN · low

The skill covers `src/cli/tui/*.js`, `src/cli/*.js` and `bin/cli.js`. This repo's user-facing CLI surface is `.claude/skills/*/cli.mjs` — nine dispatchers, every `--help` table, every error string. Running the skill as scoped against this batch would have reviewed nothing. The review was performed against the real surfaces instead, and found two defects worth fixing (below).

### D3 — Two CLI copy defects · FIXED

- `sweep.mjs` told a caller who *had* supplied `--mode bogus` that the flag "is required", conflating missing with invalid. Now three conditions say three things. The `main()` call site keeps "is required" because its argv parse reaches that branch only when the flag really is absent.
- `document gate`'s summary read `(delegates to document-gate.mjs runGate)` — implementation, not behaviour, and no sibling summary names its helper.

### D4 — The writing chain does not fit CLI copy · NOTED

`technical-writer → reader-level → humanizer` was requested for the copy fixes. Step 1 (read the implementation) did the real work — it is what revealed the same sentence is correct at one call site and wrong at another. Steps 4–6 could not run: `reader-level` and `measure.mjs` score prose files against Diátaxis targets, and two `--help` fragments are not a page. Forcing a grade-11 gate onto an eight-word summary produces a meaningless number. The craft rules transferred; the gates did not.

---

## E. Known-issue recurrences

Two entries already on the backlog fired in practice this run. Recording the recurrence, because "known" and "harmless" are different claims.

### E1 — The delta fold does not write the README count

`/archive`'s delta verification created the `roadmap-cli` element and shard, moving the corpus 115 → 116. `docs/system/README.md` still documented 115, failing `workspace-readme-gate`. Backlog `delta-fold-should-write-the-readme-count` covers automating it; corrected by hand here.

### E2 — Corpus census literals are hard-coded

`system-spec-relocation.test.mjs` asserts `elements === 115` in two places. Any element a spec legitimately adds costs an edit there. Backlog `replace-the-corpus-census-literals-with-a-relational-assertion` covers it; bumped to 116 by hand.

---

## F. Two traps recorded as landmines

Filed to `.claude/memory/landmines/` because both are things a future session re-breaks rather than schedules.

**The rebuild tax** (`manifest-restamp-is-the-last-step-before-staging-6a41`). Any edit to a manifest-hashed file leaves `audit-baseline` red until `build-template.sh --manifest-only` re-stamps. It bit twice in one cycle — stamped after `/simplify`, then two more baseline-owned files were edited during the security fixes. It surfaces as roughly a dozen governance-flavoured test failures (`epic-close governance`, `standup governance`, `hook decision paths`) that read like real regressions and are one stale hash. Cheapest diagnosis: `node .claude/skills/audit-baseline/audit.mjs 2>&1 | grep FAIL` — if every row says `hash mismatch`, it is the tax.

**Pruned-skill imports** (`pruned-skills-need-dynamic-import-in-checkers-b7c8`). See C5. Recorded as a landmine rather than a backlog item because the failure is invisible on the dev tree and only appears where nobody runs the suite.

---

## G. One defect of my own, worth keeping

`spec-review-verb.test.mjs` originally read this batch's own spec from `docs/specs/read-front-door-sweep.md`. It passed at `/integrate` and failed after `/archive` — because moving that file is what `/archive` does, on every workflow. **A test that depends on a workflow artifact is not at risk of failing; it is scheduled to fail.** Now built from inline fixtures.

Worth a lint: no test may read `docs/{specs,intake,scout,research,security}/<slug>.md` by path.

---

## Open items, by owner

| # | Item | Severity | Home |
|---|---|---|---|
| A1 | wave audit `-uall` | high | backlog `-4c19` |
| A2 | boundary guard exempts `.claude/` | high | backlog `-8b03`, needs amendment |
| A3 | recipe compliance is unverifiable | high | open question, no owner |
| A4 | `.jsonl` overlay leak | medium | backlog `-9e52` |
| A5 | fenced worker JSON | low | rule decision |
| B1 | spec write-set under-description | high | process; candidate spec-time check |
| B3 | stale gate-B token | medium | unenforced discipline |
| B4 | `/commit` prereq stale | low | SOP edit |
| B5 | commit split misplaces closure | low | `commit-split.mjs` |
| C1 | `test.cmd` vs `npm test` | medium | backlog `-3d80` |
| C2 | `title` duplicates `body` | medium | backlog `-e6ea` |
| C4 | `resolveLookup` polymorphism | low | `resolve.mjs` |
| C6 | `roadmap.path` traversal | low | hardening |
| D1 | seven SKILL.md SOPs | medium | backlog `-2f7d`, chore track |
| D2 | `cli-copy-review` scope | low | skill scope |
| G | tests reading workflow artifacts | low | candidate lint |

Fixed in-flight: B2, C3, C5, D3, plus the dispatcher exit-code affordance and the `by_concept` shape bug.

---

## What this says about swarm mode

It works. Thirteen tasks landed across three waves with no cross-task collision, and the parallelism was real — six workers running concurrently at peak.

What it does not yet have is a mechanical account of itself. The wave audit measures the wrong thing on a common case (A1). The boundary guard is disarmed exactly where this repo works (A2). Worker compliance is asserted by the worker (A3). Gate-B staleness is caught by discipline (B3). Each of those was survivable on a run where main context checked everything by hand — which is the right posture for a first production run, and not a posture that scales.

The gate-A content hash is the counter-example worth copying: it caught four post-approval amendments without being asked, and never once needed judgment.
