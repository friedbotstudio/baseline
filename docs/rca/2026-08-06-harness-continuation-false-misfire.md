# RCA: harness_continuation reported as misfiring at gate C

<!--
Root Cause Analysis. Produced by the `rca` skill.
Blameless by convention: describe systems and processes, not individuals.
-->

## Summary

At the gate-C consent boundary of the `audit-flake-writer-isolation` workflow, the `harness_continuation` Stop hook emitted its `decision:block` directive while `.claude/state/.harness_active` was absent and `harness_state.state` read `yielded`. This was reported to the user as a safety-net misfire and a possible hole in the consent gate. The hook was behaving exactly as `docs/init/seed.md` specifies; the defect is documentation drift in three derived governance files, and it is unresolved as of writing.

## Timeline

All times UTC, sourced from `.claude/state/logs/harness_continuation.log` and the session transcript.

- `2026-08-06 18:02:57 UTC` — Harness yields at gate C. Marker deleted, `harness_state` written `yielded`. Hook evaluates and stays silent. Evidence: `harness_continuation.log` → `silent: rung4 no consent token newer than harness_state`.
- `2026-08-06 18:07:xx UTC` — Terminal message tells the user to run `/grant-commit`. No hook activity.
- `2026-08-06 18:09:02 UTC` — User types `/grant-commit`. The `consent_gate_grant` UserPromptSubmit hook writes the grant marker; the assistant writes `.claude/state/commit_consent` via the Write tool. Token mtime is now newer than `harness_state`'s.
- `2026-08-06 18:09:07 UTC` — Turn ends. Hook evaluates Path B and emits `decision:block`. Evidence: `harness_continuation.log` → `emit: decision=block (Path B (rung 4, state=yielded + fresh consent))`.
- `2026-08-06 18:09:1x UTC` — Assistant inspects `.harness_active` (absent) and `harness_state` (`yielded`), concludes both Path A rungs failed, and reports to the user: *"the safety net fired on a gate it shouldn't have"*, later escalating to *"a Stop hook that re-fires at a pending consent gate would push the loop past it."* Both statements are incorrect.
- `2026-08-06 18:1x UTC` — Commit `e2b7150` lands. Workflow completes normally; the false report is carried in the closing summary.
- `2026-08-06 18:3x UTC` — `/rca` invoked. Reading `harness_continuation.mjs:8-20` and `:103-106` shows a documented **Path B**. Reading `docs/init/seed.md:145`, `:175`, `:467` shows the genesis specifies Path B in full, including the sentence *"Path B is the consent-resume normal case."*

## Impact

- **Users affected**: 1 (the repository owner), 1 occurrence. Counting method: single-session transcript review; the hook log shows one prior Path B emission this session (`14:33:35 UTC`) that went unremarked, so the misreport is not systematic.
- **Duration**: 18:09:07 UTC → 18:3x UTC, approximately 25 minutes between the false claim and its correction.
- **SLA impact**: none. No production system involved.
- **Business impact**: none measurable. The cost is operator attention: one false defect report, one unwarranted "worth an `/rca` or a backlog entry" recommendation, and the ~25 minutes of investigation that recommendation triggered.
- **Data impact**: none. No commit was blocked or forced, no gate bypassed, no consent forged, no file lost. Commit `e2b7150` is unaffected and correct.

## Detection

Self-detected, and detected for the wrong reason. The assistant noticed the hook firing under conditions the *documentation* said should be silent, and read that as an implementation defect rather than a documentation defect. The correct check — reading the hook's own header comment, which documents Path B on lines 13-19 — was not performed until `/rca` forced it.

Detection time was acceptable in the sense that nothing was riding on it. It would have been faster if the investigation had started at the implementation and the genesis spec rather than at the derived governance docs, which is the ordering `CLAUDE.md` Article I.4 already prescribes: **seed.md > CLAUDE.md > implementation**. The assistant reasoned from the middle layer outward.

## Root cause

Three derived governance documents describe `harness_continuation` as a three-rung gate that is "silent otherwise", omitting the Path B consent-resume branch that `docs/init/seed.md` specifies and `harness_continuation.mjs` implements — so an operator reading the constitution rather than the genesis concludes that correct behavior is a defect.

The drifted files:

| File | Wording | Line |
|---|---|---|
| `CLAUDE.md` Art. VIII table | "Three-rung gate re-fires `Skill(harness)` only mid-flow; silent otherwise" | hook table row |
| `.claude/CONSTITUTION.md` | "Three-rung gate: (1)… (2)… (3)… Silent on any rung fail." | 124 |
| `.claude/skills/harness/SKILL.md` | "In normal operation (loop runs to gate/failure/done), the hook sees `state != continue` or marker absent, stays silent" | "The safety net" |

`docs/init/seed.md` is correct at lines 145, 175, and 467, and the implementation matches it. Per Article I.4 the genesis and the implementation agree; the constitution layer is the one out of step. `CLAUDE.md`'s own Genesis clause makes surfacing this mandatory: *"When this constitution and seed.md conflict, seed.md governs and you SHALL stop and surface the drift before acting."*

## Contributing factors

- The drift is invisible to `audit-baseline`. The audit verifies hook *names*, counts, and settings wiring, plus specific citation strings — it does not compare a hook's documented decision paths against its implemented ones. A prose description can rot indefinitely without failing a check.
- The annex split (`ab412d1`, "cap CLAUDE.md at 40k chars and split annex") copied the then-current three-rung description into `.claude/CONSTITUTION.md:124`. Path B arrived later with the Node ESM port (`9b54561`), which updated `seed.md` and the hook but not the two constitution-layer copies or the harness SKILL.md.
- The same fact is stated in four places. Every duplicate is an independent opportunity to drift, and only one of the four is authoritative.
- Path B is rare enough to stay unnoticed. It fires once per workflow, at a single boundary, and its effect (the loop resumes) is indistinguishable from the user simply typing `/harness` — which is what the drifted docs tell you to expect.

## Resolution

Nothing to resolve in the implementation: the hook is correct and unchanged. The false report was corrected in-session. The documentation drift is open and carried by the action items below.

No fix commit exists yet. This RCA is the record; a `chore`-track workflow is the appropriate vehicle for the doc reconciliation, since it needs no failing-test-driven code change.

## What went well

- The hook logs its own decision path with the reason. `emit: decision=block (Path B (rung 4, state=yielded + fresh consent))` named the mechanism precisely; one `tail` of the log settled a question that prose reasoning had gotten backwards. Decision-logging in guards is worth its cost.
- The disjunctive gate is genuinely sound. The silent line at `18:02:57 UTC` — same `yielded` state, no fresh token, no emission — demonstrates that Path B cannot fire at a *pending* gate, which was the specific risk claimed. The gate was never at risk.
- The false report was surfaced to the user rather than quietly dropped, which is what put it in front of a review.
- `seed.md` was right. The genesis held its authority under Article I.4 exactly as designed; the precedence rule pointed at the correct file on the first read.

## What could be improved

- Investigation order. When implementation and documentation disagree, read the implementation and the genesis before concluding from the derived layer. The precedence rule that governs *authority* should also govern *diagnosis*.
- Confidence calibration in the report. "The safety net fired on a gate it shouldn't have" was stated as fact on the strength of two file reads, and then escalated into a speculative severity claim about pushing past a pending gate. The observation deserved a question, not a verdict.
- The four-copy description of one hook has no mechanical reconciliation. Prose that restates behavior needs either a single source or a check that fails when it diverges.

## Action items

- [ ] **AI-01** — Reconcile the `harness_continuation` description in `CLAUDE.md` Art. VIII, `.claude/CONSTITUTION.md:124`, and `.claude/skills/harness/SKILL.md` against `docs/init/seed.md` §4.1 / §4.2 / the hook table: describe the disjunctive gate (Path A + Path B), and delete "silent otherwise" / "Silent on any rung fail". Route via `/triage` → `chore` track. Owner: Tushar Srivastava. Due: 2026-08-13. Status: open.
- [ ] **AI-02** — Add an `audit-baseline` check that fails when a hook's governance-doc description omits a decision path the hook implements, starting with the narrow, mechanical case: every `emitLogDetail` / decision-path label present in a hook source must appear in the seed.md hook table row for that hook. Owner: Tushar Srivastava. Due: 2026-08-27 (tentative — needs a design pass on how to name paths uniformly across 26 hooks). Status: open.
- [ ] **AI-03** — Record a `landmines.md` entry keyed on the diagnosis order: when a hook's behavior contradicts `CLAUDE.md` or its annex, read `docs/init/seed.md` and the hook source before reporting a defect, because the constitution layer is the one that drifts. Owner: Tushar Srivastava. Due: 2026-08-13. Status: open.

## Links

- Hook implementation: `.claude/hooks/harness_continuation.mjs:8-20` (header contract), `:100-109` (the disjunctive gate)
- Genesis spec: `docs/init/seed.md:145`, `:175`, `:467`
- Decision log evidence: `.claude/state/logs/harness_continuation.log`, entries `2026-08-06T18:02:57Z` and `2026-08-06T18:09:07Z`
- Drifted copies: `CLAUDE.md` Art. VIII hook table; `.claude/CONSTITUTION.md:124`; `.claude/skills/harness/SKILL.md` → "The safety net"
- Commit that introduced Path B: `9b54561` (`perf(hooks): port 22 hooks to Node ESM + audit fast-path + tier hardening`)
- Commit that copied the pre-Path-B prose into the annex: `ab412d1` (`docs(constitution): cap CLAUDE.md at 40k chars and split annex`)
- Workflow that surfaced it: `e2b7150`, bundle at `docs/archive/2026-08-06/audit-flake-writer-isolation/`
