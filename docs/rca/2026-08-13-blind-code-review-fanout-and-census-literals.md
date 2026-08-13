# RCA: the code-review fan-out has never scored a diff, and three census literals went red unnoticed

<!--
Root Cause Analysis. Produced by the `rca` skill.
Required sections (enforced by artifact_template_guard): Summary, Timeline,
Impact, Root cause, Action items.
Blameless by convention: describe systems and processes, not individuals.
-->

## Summary

Two defects, discovered while the `skill-character-doctrine` workflow sat yielded at `/integrate` on 2026-08-13. The code-review checker fan-out has returned `CLEAN` on every workflow in the repository's history because nothing ever populated its input, and three node-suite assertions have been red for an unknown number of cycles because the binding verify command does not execute the node suite. Neither is resolved; both are quantified below with action items.

This is not an outage. It is a defect investigation, written as an RCA because the maintainer asked for the failure points and a plan, and because the detection story is the most useful part of both findings.

## Timeline

All times UTC. Sourced from this session's command output and from files on disk at HEAD `e36bcb9`.

- `2026-08-13 21:00` — `/standup` reports three red node-suite assertions and notes that `project.json → test.cmd` is the governance audit, so `/integrate` stamps PASS while they are red. Recorded in `.claude/memory/backlog/three-suite-assertions-anchored-to-live-state-that-moved.md`. Evidence: the entry's own body, `verified-at: 87d3573`.
- `2026-08-13 21:00` — the same entry records the second half: "`/integrate` stamps PASS from the audit while three suite assertions are red." Deferred, not fixed.
- `2026-08-13 22:02` — `/integrate` for `skill-character-doctrine` runs the binding command. `node .claude/skills/audit-baseline/audit.mjs` → exit 0, 138 checks, `overall PASS fails=0 warns=0`.
- `2026-08-13 22:05` — the full node suite is run separately: `2855 tests, 2836 pass, 3 fail`. The three failures are the three from the 21:00 standup, by name.
- `2026-08-13 22:19` — the code-review fan-out is invoked with a hand-assembled `ctx` carrying 36 real `changedFiles`. Verdict `BLOCKED`: 12 `file_length` BLOCKERs, 1 `security` BLOCKER, 1 `comment_ratio` ADVISORY.
- `2026-08-13 22:20` — the `security` BLOCKER is traced to a bare `### [HIGH]` heading in a report whose finding was already fixed. `security/oracle.mjs:12` matches the heading, not the prose. Re-titled per the convention recorded the same day; blocker clears.
- `2026-08-13 22:21` — `changedFiles` is rescoped to source modules only. 12 `file_length` BLOCKERs become 3.
- `2026-08-13 22:22` — every archived projection under `.claude/state/checker-fanout-code/` is inspected. All read `{"findings": [], "verdict": "CLEAN"}`. Evidence: `standup-recap-single-pass.json`, `contracts-rows-resolve-at-drift-check.json`, `consumer-install-defects.json`.
- `2026-08-13 22:23` — `grep` confirms no helper anywhere in `.claude/skills/` assembles `changedFiles`; `.claude/skills/integrate/` contains only `SKILL.md`.

## Impact

- **Users affected**: every workflow run in this repository that reached `/integrate`. Counted by enumerating `.claude/state/checker-fanout-code/*.json` — one projection per workflow, all recording a zero-finding `CLEAN`. No consumer install is affected: this is a dev-loop quality gate, not shipped runtime behaviour.
- **Duration**: unknown start; the fan-out's code-review phase has produced no real finding for its entire life on disk. The three red assertions are bounded more tightly — the standup entry dates the observation to 2026-08-13, and the `PATH_LEG_BASELINE` header comments narrate five prior bumps of the same literals, so the pattern predates this cycle by several flushes.
- **SLA impact**: none. No service, no error budget.
- **Business impact**: none measurable in dollars. The cost is a quality gate that reported success without measuring anything, which is worse than an absent gate because it was trusted.
- **Data impact**: none. No corruption, no loss. Both defects are read-side.

## Detection

**Neither defect was detected by the system that owns it.** Both surfaced because a human asked for a number rather than a verdict.

The fan-out's blindness was invisible by construction: `checker-fanout.mjs:64` reads `ctx.changedFiles || []`, so an absent input produces an empty scan, an empty scan produces zero findings, and zero findings render as `CLEAN`. Every layer behaved correctly and the composition reported success. It became visible only when this cycle's `/integrate` assembled a real `ctx` — which the SOP asks for but nothing enforces — and the verdict flipped to `BLOCKED` on the first honest input it has ever received.

The three red assertions were detected by `/standup` on the morning of the same day, and the detection was accurate. What failed was the follow-through: the finding was recorded as a backlog deferral and the workflow continued, because the binding verdict was green and nothing required the two to agree.

**What would have made detection faster:** in both cases, a check that distinguishes *measured zero* from *measured nothing*. The repository already holds this as a convention — `a-verdict-must-distinguish-checked-from-nothing-to-compare` — applied to the standup's remote probe. It was not applied here.

## Root cause

**Two independent root causes, each conclusive.**

**RC-1 (fan-out).** The code-review fan-out's `ctx` assembly is delegated to main-context prose in `integrate/SKILL.md` with no shipped helper and a fail-open `|| []` default, so a step that is skipped and a diff that is clean produce byte-identical output.

**RC-2 (census literals).** Assertions pin exact counts derived from the live memory store, while 45 memory entries carry a `**` glob in `governs:`, so any flush that adds one broadly-scoped entry moves counts in files it has nothing to do with.

## Contributing factors

- `project.json → test.cmd` is `node .claude/skills/audit-baseline/audit.mjs --file={file}` — the governance audit, not the node suite. The binding verify verdict therefore never executes the tests carrying these assertions, so a red suite and a green stamp coexist indefinitely. This is what converted RC-2 from a caught failure into a latent one.
- The census/budget distinction is recorded in the conventions memory but is not visible at the assertion site. `test_when_phase_budgets_measured_then_within_stated_caps` (a policy budget) and `test_when_path_leg_measured_then_governs_hit_counts_unchanged` (a factual census) sit in the same `describe` block and read identically, so both invite the same wrong repair: re-measure to today's value, which silently converts the budget into a zero-headroom tripwire.
- The landmine `a-wide-governs-glob-ripples-into-unrelated-literals` already documents RC-2's mechanism, and the test file's own header comments narrate five prior bumps of the same literals. The knowledge existed; nothing acted on it, because each individual bump is a one-line edit that is cheaper to absorb than to fix upstream.
- The 3 surviving `file_length` BLOCKERs (`audit.mjs` 90→91, `checker-fanout.mjs` 136→138, `build-template.sh` 142→145) are a **symptom of RC-1, not a cause**. All three exceeded the 80-line budget before this workflow touched them; the current diff adds one, two, and three lines respectively. They are simply the first output the check has ever produced.

## Resolution

**Not resolved.** Both defects are open as of writing. Two related items were fixed in-cycle and are recorded here so the RCA is not mistaken for a clean bill of health:

- The `security` BLOCKER in the 22:19 run was a bare `### [HIGH]` heading on an already-fixed finding. Re-titled to `### [HIGH — RESOLVED]` per `.claude/memory/conventions/resolved-security-findings-are-retitled-not-deleted.md`. This was a reporting defect in this cycle's own artifact, not an instance of RC-1 or RC-2.
- The 12→3 reduction in `file_length` BLOCKERs came from scoping `changedFiles` to source modules. Feeding a module-splitting budget to a 410-line Markdown spec measures the wrong thing; that was an error in this cycle's hand-assembled `ctx`, and it is exactly the kind of error a shipped assembler (AI-03) would make impossible.

## What went well

- **The fail-open default was fail-open in the right direction.** RC-1 produced false negatives, never false positives. No workflow was ever blocked by a checker that had not actually run.
- **`/standup` caught RC-2's symptoms and named the mechanism correctly** on the morning of the same day, including the second-order finding that `test.cmd` does not run the suite. The detection layer worked; only the follow-through did not.
- **The repository had already written down both mechanisms** — the wide-glob landmine, the census/budget distinction, the retitle-don't-delete convention, and the verdict-must-distinguish-checked-from-nothing convention. Every root cause below was diagnosable from memory the repo already held.
- **The `comment_ratio` check landed in this same cycle and immediately produced a true positive** on `scripts/build-template.sh` at 1.19, at ADVISORY severity, blocking nothing — the file the research memo had predicted at 1.176. A new check behaving exactly as specified on its first real run.

## What could be improved

- A quality gate whose input is assembled by prose instructions will eventually be run with no input. Inputs that decide a verdict belong in a helper, not in a SOP paragraph.
- A verdict of `CLEAN` with an empty findings array and an empty input set should not be spelled the same way as a verdict of `CLEAN` over a real diff.
- The binding test command and the test suite the repository actually maintains should be the same thing, or the divergence should be surfaced at every verify rather than known only to whoever reads `project.json`.
- A deferral recorded in the backlog closed the loop socially but not mechanically. The `deferred:` reason tag introduced by the in-flight workflow addresses exactly this, and this RCA's own action items are the first real test of whether it holds.

## Action items

Owner is the repository maintainer (Tushar Srivastava) throughout — this is a single-maintainer repository, and assigning a different name would be fiction. Due dates are **tentative**: they are ordered by dependency, not committed to a calendar.

- [ ] **AI-01** — Widen `project.json → test.cmd` to cover the node suite, or add a second binding command, so a red assertion cannot coexist with a green stamp. Blocks honest verification of AI-02 and AI-03. Owner: Tushar Srivastava. Due: 2026-08-20 (tentative). Status: open.
- [ ] **AI-02** — Repair `memory-readers-sharded.test.mjs:127`: assert the question-id *shape* or the first shard's actual `key:`, not the literal `Q-002`. The test's subject is that sharded questions are gathered, not that one specific question exists forever. Owner: Tushar Srivastava. Due: 2026-08-20 (tentative). Status: open.
- [ ] **AI-03** — Ship a `changedFiles` assembler as a helper invoked by `/integrate`, and decide explicitly whether an empty `changedFiles` at the code-review phase is a skip or an error. Fixes RC-1. Owner: Tushar Srivastava. Due: 2026-08-27 (tentative). Status: open.
- [ ] **AI-04** — Re-measure the four `PATH_LEG_BASELINE` literals and name the commit that moved each, per the census convention. Do **not** re-measure `PHASE_BUDGETS.spec` to 73; decide a ceiling with headroom and record the reasoning, per the budget convention. Owner: Tushar Srivastava. Due: 2026-08-27 (tentative). Status: open.
- [ ] **AI-05** — Narrow the 45 memory entries carrying a `**` glob in `governs:` to named modules, and add a `/memory-sync` check that questions a new wide glob at write time. Fixes RC-2 at the source; without it AI-04 is repeated every few flushes. Owner: Tushar Srivastava. Due: 2026-09-10 (tentative). Status: open.
- [ ] **AI-06** — Resolve the three `file_length` BLOCKERs (`audit.mjs`, `checker-fanout.mjs`, `build-template.sh`) by splitting along layer lines, or record an explicit exemption. Meaningful only after AI-03, since before it the check reports nothing. Owner: Tushar Srivastava. Due: 2026-09-10 (tentative). Status: open.

## Links

- Backlog entry that first recorded RC-2's symptoms: `.claude/memory/backlog/three-suite-assertions-anchored-to-live-state-that-moved.md`
- Landmine documenting RC-2's mechanism: `.claude/memory/landmines/a-wide-governs-glob-ripples-into-unrelated-literals.md`
- Convention distinguishing census from budget: `.claude/memory/conventions/census-and-budget-are-different-numbers.md`
- Convention on retitling resolved findings: `.claude/memory/conventions/resolved-security-findings-are-retitled-not-deleted.md`
- Convention on verdicts that distinguish checked from nothing-to-compare: `.claude/memory/conventions/a-verdict-must-distinguish-checked-from-nothing-to-compare.md`
- Fail-open default at the heart of RC-1: `.claude/skills/harness/checker-fanout.mjs:64`
- SOP paragraph delegating `ctx` assembly to main context: `.claude/skills/integrate/SKILL.md`, step 3.5
- The workflow during which this was found: `docs/specs/skill-character-doctrine.md`, and its security report `docs/security/skill-character-doctrine-2026-08-13.md`
