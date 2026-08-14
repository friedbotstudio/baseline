# Make the causal chain of a diagnosis the reviewable object, witnessed by runtime readings

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

When a bug's cause is unknown, this baseline has no phase for finding it. `/triage`
offers `tdd-quickfix` for "localized bug; no spec needed" — but that track's own
`selector_hints` assume a **known failing case**. `/rca` writes a postmortem *after* an
incident and is explicitly "not for a normal TDD failure". The gap between them is the
common case: a test fails, the assertion message does not explain why, and the cause has
to be found before anything can be specified or fixed.

Today that finding happens in unstructured conversation. Two consequences follow.

**First, the diagnosis has no oracle.** The vision document states the rule at
`docs/vision/baseline-v1-thought-compiler.md` §2.2:

> A maker/checker loop is self-correcting ONLY if the checker stands on a mechanical
> oracle. Two LLMs left to converse will agree on a hallucination — wrong answers,
> faster, with more confidence.

Every other verdict in this pipeline is anchored. `/integrate` stamps a binding
`last_test_result`. `spec-shippability-review` returns BLOCKER only on a concrete
artifact. `§5.1` makes the rule general: a finding with a concrete artifact can block, a
bare assertion is advisory. A claim about what a variable held at line 41 has no such
anchor — it is produced by reading code and inferring, which is exactly the failure mode
§2.2 names.

**Second, the human cannot audit the reasoning.** §2.5:

> The role shifts from **author to auditor**. The leverage artifact is not the diff, it is
> the **explanation trace**: signal → hypothesis → reproduction → fix →
> proof-of-correctness. An AI-native debugging UX should make that **causal chain** the
> reviewable object, so a human can accept/reject the *reasoning* without reading every
> line.

Neither artifact exists. There is no `docs/debug/`, no trace, no witness field. The
concrete scenario: a maintainer sees "the retry loop exits early", is told the cause is a
config default, and has no way to check that claim short of re-deriving it. The claim may
be right. Nothing in the repo distinguishes a right one from a confident wrong one.

Backlog `gate-taxonomy-then-debugging-skill-then-v2-9008` has tracked this since
2026-06-05, deliberately coarse, unstarted.

## Goal

A maintainer can accept or reject a diagnosis by reading its causal chain, because every
causal claim in that chain cites a value observed in the running program.

## Non-goals

- **Not an autonomous fixer.** The session diagnoses and stops. Writing the fix stays with
  `/tdd`; proving it stays with `/integrate`. This is vision piece 5, not v2's
  signal-driven loop.
- **Not a replacement for `/rca`.** `/rca` stays the postmortem on a past incident and
  stays out of the phase chain. A trace may feed an RCA; neither absorbs the other.
- **Not a replacement for `tdd-quickfix`.** A bug with a known cause and a known failing
  test keeps routing there. The new track is for the case where the cause is unknown.
- **No new consent gate and no new command.** `/approve-direction` already accepts a path
  argument. The commands stay at 6.
- **No new hook and no new subagent.** Hooks stay at 26, subagents at 1. Two existing hook
  prefix tables gain a row; no hook is added, removed, or disabled.
- **Not a debugger UI.** No stepping interface, no watch windows, no visualisation. The
  reviewable object is a markdown file.
- **Not a commitment to every language mcp-debugger supports.** The baseline verifies the
  path it can run here; consumer projects supply their own toolchain.

## Success metrics

Measured from the artifacts themselves — no new instrumentation is built to collect them.

- **Witnessed root causes** — share of `docs/debug/*.md` traces reaching a `Root cause`
  where that sentence cites at least one Observations row. Baseline: 0 (no mechanism
  exists). Target: 100%. Measured via: the trace files; an uncited claim is refused at
  write time, so any counterexample is a defect.
- **Refuted hypotheses per trace** — count of Observations rows with verdict `refuted`.
  Baseline: unmeasurable (hypotheses are not recorded today). Target: > 0 on the median
  trace, which is the evidence that probes are chosen to falsify rather than to confirm.
  Measured via: the Observations table.
- **Governance drift** — `node .claude/skills/audit-baseline/audit.mjs` exit code across
  the three slices. Baseline: 0 (PASS). Target: 0 (PASS). Measured via: the audit.
- **Suite health** — `npm test` failures introduced. Baseline: 0. Target: 0.

## Stakeholders

- **Requester**: Tushar Srivastava (repo owner) — raised the request, chose the epic track
  and the three-slice split, and directed that the review be conversational rather than a
  new gate.
- **Reviewer**: Tushar Srivastava — sole approver at gate A and gate C.
- **Operator** (who runs it in prod): Tushar Srivastava, and every downstream consumer who
  installs the baseline overlay. The overlay ships to other repositories, so a change that
  works only in this tree is a defect.

## Constraints

- **Article I.4 ordering.** `docs/init/seed.md` is amended first, then `CLAUDE.md`, then
  the implementation. `src/seed.template.md` and `src/CLAUDE.template.md` are mirrors;
  the CLAUDE pair is byte-equal (Article XII.4).
- **Article VIII.** Two hook prefix tables must gain `docs/debug/`
  (`.claude/hooks/lib/memory_stop.mjs` `SKIP_PREFIXES`,
  `.claude/hooks/process_lifecycle_guard.mjs` `PHASE_BY_PREFIX`). Modifying a hook needs a
  `seed.md` §4.1 amendment, which slice A carries. The hook **count** stays 26.
- **Article II.** The session runs in main context. Choosing a hypothesis is binding
  judgment and is never delegated to a subagent.
- **U6, no irreplaceable dependency** (`seed.md` §2.5). The baseline is open-source and
  must not hard-couple consumers to one service. The new rule is therefore written as an
  outcome mandate — `mcp-debugger` is the shipped default, replaceable by a debugger CLI
  or recorded instrumentation, the same standing `context7` holds.
- **`.claude/workflows.jsonl` is `NEVER_TOUCH`** (`scripts/build-manifest.mjs`). Existing
  consumer installs receive a new track only via `/init-project doctor`, not a plain
  upgrade. The track record must be written to both the live file and
  `src/.claude/workflows.template.jsonl`.
- **Count cascades are not one-file edits.** Skills 58→59, MCP servers 4→5, tracks 9→10.
  `.claude/memory/landmines/baseline-skill-count-cascade.md` records the full sweep,
  including three surfaces the obvious checklist misses.
- **Shipped-skill rules.** A baseline-owned skill declares `owner: baseline`, carries a
  Character block, and ships helpers as `.mjs`/`.sh` — no new Python
  (`spec-shippability-review`).
- **Project-agnostic mode must keep working.** A consumer with no debug toolchain installed
  must still be able to run every other track.
- **Runtime cost.** `mcp-debugger` needs Node 22+ and a per-language debug toolchain. It
  cannot be assumed present.

## Acceptance criteria

Grouped by epic slice. Each row is one testable statement.

### Slice A — the runtime-witness rule and the `mcp-debugger` declaration

1. Given a causal claim about program behavior at runtime, when it cites no value observed
   from the running process, then the constitution classifies it as a hypothesis and not a
   witnessed claim.
2. Given a project that removes `mcp-debugger` from `.mcp.json` and satisfies the rule with
   a debugger CLI or recorded instrumentation, when `audit-baseline` runs, then it exits 0
   — the rule mandates the outcome, not the tool.
3. Given the two hook table edits slice C makes, when `audit-baseline` reconciles the hooks
   against `seed.md` §4.1, then the amendment covers them and the hook count reads 26.
4. Given the declared MCP server count moves from 4 to 5, when `audit-baseline` and the
   eleventy site build both run, then each exits 0 and every surface stating the count
   agrees.
5. Given `src/seed.template.md` and `src/CLAUDE.template.md`, when the mirror check runs,
   then the CLAUDE pair is byte-equal and the seed mirror carries the same §2.7, §4.1 and
   §4.5 text.

### Slice B — the `/codebugger` session and the explanation trace

6. Given a `/codebugger` invocation, when the session runs, then every hypothesis is chosen
   in main context and no subagent is spawned to choose one.
7. Given failure evidence already on disk (`.claude/state/last_test_result`, test output,
   the branch diff), when Stage 1 runs, then the Signal and Reproduction sections are
   derived from it and the human is asked only what that evidence cannot answer.
8. Given a Stage 2 cycle, when the probe is proposed, then it states exactly one hypothesis
   together with the single observation that would falsify it, and the human can redirect
   it before it runs.
9. Given a probe that executes against a running process, when its row is recorded, then
   the `Observed` cell holds the value actually read, not a restatement of the hypothesis.
10. Given a probe whose only evidence is recorded instrumentation output rather than a
    runtime read, when its row is recorded, then the row is labeled lower-confidence.
11. Given a proposed `Root cause` sentence that cites no Observations row, when the trace
    is written, then the sentence is refused and the section reads
    "not conclusively identified".
12. Given a debug session that fails or errors mid-probe, when the cycle ends, then the
    session is closed.
13. Given a project where no debug adapter is available, when `/codebugger` runs, then it
    completes with instrumentation witnesses rather than failing.
14. Given the skill count moves from 58 to 59, when `audit-baseline` and `npm test` run,
    then both exit 0.

### Slice C — the `debug` track and the `docs/debug/` registration

15. Given a request whose cause is unknown and needs runtime observation, when `/triage`
    classifies it, then `debug` is among the candidate tracks; given a known cause with a
    failing test, then `tdd-quickfix` still is; given a past incident, then `/rca` is still
    the answer and is still not a phase.
16. Given an accepted trace at `docs/debug/<slug>.md`, when the human runs
    `/approve-direction docs/debug/<slug>.md`, then the approval token is written — with no
    new command and no new consent gate.
17. Given a trace file in the working-tree diff, when `drift_check.mjs` resolves acceptance
    criteria, then the trace cannot satisfy any criterion.
18. Given a trace file, when the Stop hook extracts memory candidates, then trace prose is
    not mined.
19. Given a completed `debug` workflow, when `/archive` runs, then
    `docs/debug/<slug>.md` is archived with the other workflow artifacts.
20. Given the new track record, when
    `node .claude/skills/triage/seed-tasklist.mjs --validate-only` runs, then invariants I1
    through I11 pass and the selectable-track count reads 10 on every surface stating it.

## Open questions

- **RESOLVED by `/research`. Package identity.** Verified against the npm registry and the
  project's own docs: `@debugmcp/mcp-debugger@0.23.0`, MIT, `engines: {"node":">=22.0.0"}`,
  `bin: {"mcp-debugger":"dist/cli"}`, `dependencies: {}`. The `stdio` positional is
  required "to prevent console corruption of JSON-RPC protocol".
- **RESOLVED by the engineer, 2026-08-15. Trace persistence.** Committed, but the
  `Observed` cell records a bounded typed rendering rather than a raw value. The README's
  agent-path redaction claim could not be verified — the only reachable redaction is
  log-side scrubbing — so no raw program memory enters git history. Spec §Decisions D2.
- **RESOLVED by execution. The `isCitable` import.** `witness.mjs` imports standalone at no
  cost, but `isCitable('runtime-read')` returns false, so importing it unchanged refuses
  every row. The predicate is widened by one string; the registry, which carries the
  config gate, is not touched. Spec §Decisions D3.
- **OPEN. Adapter scope for the acceptance evidence.** This tree is Node/ESM, so the
  `js-debug` adapter is the one path exercisable end to end here. Whether slice B's
  acceptance requires a second adapter, or accepts one witnessed language plus the
  instrumentation fallback, is unresolved.
- **OPEN, low stakes. Probe-cycle cap.** The cap is set at 6 by analogy with brainstorm's
  Stage 2 cap of 2 and implement's RALPH cap of 5. No measurement supports 6 specifically;
  it is a starting value to be revised once real traces exist.
