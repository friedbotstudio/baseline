# Baseline v1 — the thought compiler (vision + audit)

Status: vision note, not a spec. Captured 2026-06-01 from a design conversation.
This is forward-looking direction for amending the constitution and reworking the
workflow; it is NOT yet triaged into a workflow. When v1 work begins it should go
through a real intake → spec → approve cycle (see "Sequencing" below).

---

## Part 1 — The vision (as framed by the project owner)

### 1.1 Agent-team system (parallel, self-correcting)

The current workflow is linear, partly because Article II forbids subagents from
making design decisions. The proposal: amend the constitution to allow an
**agent-team** system.

- The **main thread is the orchestrator**; other threads are background worker
  agents.
- Workers can further spawn general agents for **research, review,
  security & validation, and development**.
- This is an **extension of swarm mode**, but with genuinely parallel agents that
  talk to each other and act as a **self-correcting loop** (check-and-balance),
  making work faster without losing quality.
- Possible "herd knowledge" advantage: each agent holds its own running-context
  memory, so the team's effective context-holding capacity multiplies.

Goal: rework the workflows to exploit the agent-team so application development is
multiples faster, **reactive** (event-driven rather than wake-loop), and higher
intelligence.

### 1.2 Plan mode as the orchestration spine

- A **plan** = a tasklist + a goal + top-level "how to proceed".
- After a spec is **approved**, approval **triggers plan mode** for orchestration.
- The plan is a **living artifact**: Claude Code can update it mid-flight, which is
  the hook for self-correction.
- **Maker/checker protocol over a RALPH loop:** one or more **maker** nodes execute
  parts of the plan; one or more **checker** nodes review and critique in a loop.
- The **orchestrator** holds the plan in context and governs maker/checker nodes,
  assigning each a part of the plan.
- A node **executes its assigned part verbatim**, but may **update its own plan on
  foreign input** — from the orchestrator (parent) or sibling worker nodes.

When this machinery exists, label it **baseline v1**: "a powerful factory contained
in a self-correcting thinking machine" — a **thought compiler**.

### 1.3 After v1 — the AI-native operating system (v2)

A signal-driven machine that connects to:

- instrumentation (Sentry, Grafana, CloudWatch, …),
- analytics (GA4, Hotjar, …),
- CRM (Twenty, Salesforce, …),
- CI pipelines, and others.

These feed the factory raw material (data) to act on. The loop:
**receive an instrumentation signal → diagnose the issue → prepare a fix →
deploy it**, with no direct human input for routine cases. A human is **notified**
of the fix, and for **critical** cases is asked to **authorize** the deploy.

### 1.4 AI-native debugging UX (open thread)

If the system fixes itself, how does a human stay able to keep it running without
reading every line? The owner's instinct: debugging itself gets upgraded in an AI
world. Build a **skill** that is an **AI-native UX for human-assisted debugging
sessions** — so a human can understand an issue and its fix without depending
entirely on the AI to generate the fix.

---

## Part 2 — Audit (assessment of the vision)

### 2.1 What's right

- Orchestrator-holds-the-plan / workers-execute-parts is the correct decomposition,
  and it is the natural evolution of swarm mode (write_set isolation, worktree
  safety, the wave scheduler are already in place).
- Plan-mode as the spine (spec → approve → plan → execute) is the missing
  connective tissue between the spec phase and the TDD phase.
- Mid-flight replanning is powerful **if** the plan is treated the way the baseline
  already treats `workflow.json`: a durable, on-disk, versioned object where a
  replan is a visible **diff**, not a silent mutation. The baseline's edge is
  durable state + structural gates; the plan must stay in that lineage to keep
  auditability.

### 2.2 The load-bearing principle: checkers need ground-truth oracles

A maker/checker loop is self-correcting ONLY if the checker stands on a mechanical
oracle. Two LLMs left to converse will agree on a hallucination — wrong answers,
faster, with more confidence. The baseline already encodes this discipline
(binding `last_test_result`, `verify_pass_guard`, no-self-approve,
no-internal-mocks).

Design rule for the agent team:

- **Checkers must be anchored to mechanical oracles** — does it compile, do tests
  pass, does it run, does the diff satisfy each AC.
- LLM-judgment is allowed **only** where no oracle exists, and must be **labeled
  lower-confidence**.
- Generation was never the bottleneck; **trustworthy verification** is. Spend the
  parallelism budget on **adversarial checking** (N independent skeptics with
  distinct lenses), not on N makers.

### 2.3 Article II is the spec for the amendment, not the obstacle

Article II forbids subagent design decisions because a subagent sees only a brief
and produces visibly worse judgment. The amendment should **bound**, not delete,
that protection:

- Workers may decide **inside a frame the orchestrator owns**.
- The orchestrator holds the **only** cross-cutting context.
- Any worker decision that **widens scope or crosses a write_set boundary bounces
  back up** to the orchestrator.

This keeps what Article II bought while unlocking parallelism.

### 2.4 Honest caveats

- **Context multiplication is a breadth multiplier, not a depth multiplier.** N
  agents give N× working memory across the *surface* (cover more at once). They do
  NOT give N× depth on a single coherent decision, because the merge step
  re-serializes everything back through one context and synthesis is lossy.
  Treat the **integration/synthesis step as a first-class, hard problem.**
- **Reactive + autonomous multiplies the consent problem.** The more the system
  acts on its own (signal → fix → deploy), the MORE the Article IV/VII gates
  matter. The hard part of the v2 OS is not wiring up GA4/Sentry/CI; it is
  **classifying "critical, ask a human" vs "safe, just do it"** — and that
  classification is itself the judgment that can't be fully delegated. **Build the
  gate taxonomy before the autonomy.**

### 2.5 The debugging question is the sharpest part

The role shifts from **author to auditor**. The leverage artifact is not the diff,
it is the **explanation trace**: signal → hypothesis → reproduction → fix →
proof-of-correctness (what invariant it restores, what it was verified against).
An AI-native debugging UX should make that **causal chain** the reviewable object,
so a human can accept/reject the *reasoning* without reading every line. The raw
materials already exist: spec ACs, the security report, the verify verdict, the
archive bundle. The debugging skill is those — made live, linked, and
interrogable.

### 2.6 Caution on labeling / scope

Agent-team + plan-mode is itself a large build; the AI-native OS is a separate
product. Don't let "v1" swallow both:

- **v1** = the thought compiler (orchestrator + durable diffable plan + grounded
  maker/checker), proven by **dogfooding it on the baseline's own backlog**.
- **v2** = the signal-driven OS, riding on a v1 you already trust.

The differentiator will NOT be parallel makers (everyone will have those). It will
be that the **checkers are grounded in real oracles** and the **plan is durable,
diffable state**. That is what turns "faster code generation" into an actual
self-correcting machine.

---

## Part 3 — Sequencing (suggested)

1. **Amendment first (governance).** Amend `docs/init/seed.md` (genesis governs),
   then `CLAUDE.md` Article II, to permit bounded agent-team execution under an
   orchestrator. Define: who may spawn whom, the write_set/scope-escalation rule,
   and the orchestrator-owns-cross-cutting-context invariant.
2. **Plan-as-durable-state.** Specify a `PLAN.md` (or `.claude/state/plan/<slug>.json`)
   schema: goal, tasklist, per-node assignments, version/diff history. Replan = a
   recorded diff. Mirror the `workflow.json` discipline and the consent-gate
   pattern.
3. **Maker/checker protocol.** Define the RALPH loop with checker→oracle binding,
   adversarial-lens checkers, and the synthesis/integration step as an explicit
   phase (not an afterthought).
4. **Gate taxonomy.** Before any autonomy: the "safe vs ask-a-human" classifier,
   anchored in Article IV/VII.
5. **AI-native debugging skill.** The explanation-trace UX.
6. **Only then v2** (signal connectors + act-on-signal loop).

Each of 1–5 deserves its own intake → spec → approve cycle. Do not graft onto a
mid-flight workflow.

---

## Part 4 — Open questions

- How does the orchestrator detect a checker/maker deadlock or oscillation
  (two nodes flip-flopping)? What is the RALPH cap + escalation, analogous to the
  design-ui 3-iteration cap and the implement 5-iteration cap?
- Where does "reactive (event-driven, not wake-loop)" actually live — a daemon, a
  hook, an external scheduler? The baseline today is turn-driven; true reactivity
  is an architecture change, not a skill.
- What is the merge/synthesis oracle? When N workers return, what mechanically
  decides the integrated result is correct (beyond "tests pass")?
- For v2 autonomy: what is the rollback contract when an auto-deployed fix is
  wrong, and who/what owns the kill switch?

---

## Part 5 — Refined design (2026-06-05 discussion)

This part supersedes the Part 3 sequencing with a sharper checker mechanism and an
8-piece decomposition. Part 1–4 stand as the original capture.

### 5.1 The checker is an adversarial oracle-author, not a reviewer

A checker rewarded for *finding a hole* (not for being right that it fails) is
adversarial — black-hat reviewer, bad-actor advocate, edge-case hunter. But a pure
find-a-hole reward, unbounded, never ships. So every checker finding carries a
**proof obligation**:

- Finding **with a concrete artifact** (a surviving mutant, a failing security
  test, a SAST line, a named symbol to rename) → real, **can block**.
- Finding that is **only an assertion** ("feels over-engineered", "could be
  exploited", "hard to read") → **advisory, labeled low-confidence, cannot block
  alone**.

The proof *is* the oracle. This implements §2.2 mechanically and gives the RALPH
loop a real termination condition (below).

### 5.2 Stage checkers, re-axed by oracle vs judgment

The owner's stage taxonomy (brainstorm / spec / tdd / security / review) is the
*assignment* axis (which checker runs when). §2.2 adds the *blocking* axis: each
stage checker splits into an oracle-bound part (can block) and a judgment part
(advisory only).

| Checker | Oracle-bound part (BLOCKS) | Judgment part (ADVISORY) |
|---|---|---|
| Brainstorm | — (none) | over-engineering vs under-capture — riskiest, empty oracle column |
| Spec | acyclic dep graph, AC→sequence traceability, layer model | "is this the right architecture" |
| TDD | **mutation survival**, AC coverage | "are these the scenarios that matter" |
| Security | SAST/semgrep hit, CVE scan, failing security test | threat-model calibration |
| Review | linter/formatter, naming regex, dup detection | "is this readable", taste smells |
| **AC-conformance** (added) | every AC's test green on integrated tree (also the merge oracle) | — |

Rule: the oracle column blocks; the judgment column advises and never blocks alone.
The brainstorm checker has an empty oracle column, so it is the one checker that
must surface to a human rather than block autonomously (open question, §5.6).

### 5.3 The checkers already exist on disk — v1 is re-wiring

The five+1 checkers map ~1:1 onto shipped skills: brainstorm→`brainstorm`;
spec→`spec-lint`+`spec-diagram-review`+`spec-traceability-review`+`code-structure`;
tdd→`scenario`+the new mutation oracle; security→`security`;
review→`simplify`+`code-structure`+`code-review`; AC-conformance→`integrate`. v1
promotes these from "things main-context runs in sequence" to "adversarial nodes the
orchestrator runs in parallel against the maker's output, each bound to its oracle."
The **maker is nearly free** — it is the existing `implement` skill (5-iteration
RALPH). The whole build is checker orchestration + oracle-binding, not greenfield.

### 5.4 Termination: floor + ceiling, never conflated

Fixpoint ("no checker can produce a new falsifiable finding") is the infinite-budget
ideal; the affordable approximation needs two distinct knobs:

- **Floor (quality threshold)** — denominated in each checker's *adversarial-survival*
  unit, NOT execution coverage (line coverage is the gameable fake oracle). TDD floor
  = **mutation score** (e.g. 80% mutants killed); above it, survivors → advisory.
- **Ceiling (effort budget)** — N rounds or T tokens per checker; this is the actual
  token-hunger cap.

Collision rule (load-bearing): hitting the **ceiling below the floor is NOT
"advisory" — it is a red state → yield to human.** Letting budget-exhaustion silently
downgrade findings recreates the `verify_pass_guard` PASS-when-FAIL failure. Per
checker:

```
green-stop  when  floor reached  OR  k consecutive dry rounds
red-stop    when  ceiling hit AND floor not reached   → yield to human
```

Dry-round detection (marginal blocking-finding rate → 0) stops cheap checkers in one
round; only expensive ones approach the ceiling. Advisory residue is **logged to the
backlog with its proof obligation attached**, never silently dropped (preserves the
§2.5 explanation-trace).

### 5.5 One config dial drives both knobs; arbitration falls out of the oracle split

A `project.json` **threat/value tier** (e.g. `internal-tool` / `customer-data` /
`regulated`) sets, per checker, which oracles are mandatory vs advisory and the
floor+ceiling values — so "how hard do we search" and "know when to stop" are pinned
config, not per-run judgment. Same pattern as `git.protected_branches`.

Orchestrator **arbitration precedence** is not a vibe: oracle-bound findings outrank
judgment findings, always. Two oracle-bound findings cannot truly conflict (both
mechanically true) — an apparent conflict means the *spec* is wrong, routing to the
existing "integrate failed → needs spec change → yield" escape hatch. The
orchestrator never adjudicates taste.

### 5.6 Open question carried forward

The brainstorm checker has no oracle. Either (a) accept it as a human-seam checker
that always surfaces rather than blocks, or (b) manufacture a partial oracle —
forcing every brainstorm scope-cut to be recorded as an explicit non-goal a later
phase can challenge, turning "we dropped X" into a falsifiable claim.

### 5.7 The 8-piece decomposition (supersedes Part 3)

Each piece is its own intake → spec → approve cycle. Ordered so Slice A is the
smallest dogfoodable vertical slice.

**Slice A — smallest end-to-end thing (mostly independent):**
1. ✅ **SHIPPED** (`-c732`, commit `75257cb`) — **Minimal governance exception** —
   amended seed.md §4.2 + Article II §II.A *just enough* to permit ONE bounded
   maker/checker experiment on a single disjoint-write_set task. Resolved the
   prototype-vs-amend chicken-and-egg.
2. **Threat/value tier config dial** — `project.json` tiers → mandatory-vs-advisory
   oracles + floor/ceiling per checker. Tiny, foundational, every checker reads it.
3. ✅ **SHIPPED** (`-f029`, commit `6c85282`) — **Mutation oracle for the TDD
   checker** — the one genuinely new mechanical capability (mutation score, not
   coverage), built on Stryker (`scripts/mutation-oracle.mjs`, `npm run test:mutation`).
   Dogfoodable on the baseline's own suite. Currently **advisory-only**: floorless,
   never writes `last_test_result`. Wiring it as a blocking checker needs the piece-2
   floor (below) and the piece-5 loop.

**Slice B — the loop (depends on A):**
4. **Promote existing review skills to oracle-bound checkers** — refit
   `spec-lint`/`spec-diagram-review`/`security`/`simplify`/`code-structure` to emit
   the proof-obligation contract (artifact → block, assertion → advisory → backlog).
5. **Maker/checker RALPH protocol + stop rule + arbitration** — the loop:
   floor→advisory, dry-rounds→stop, ceiling-below-floor→yield, plus oracle-over-
   judgment precedence. Depends on 2, 3, 4.
6. **Plan-as-durable-diffable-state** — `.claude/state/plan/<slug>.json` schema;
   replan = recorded diff; mirrors `workflow.json` + consent-gate discipline.

**Slice C — earns autonomy, then v2 (later):**
7. **Real Article II amendment** — written *after* 1–6 are prototyped, blessing what
   was learned; supersedes the minimal exception from piece 1.
8. **Gate taxonomy → AI-native debugging skill → v2** — safe-vs-ask-a-human
   classifier, then the explanation-trace debugging UX, then the signal-driven OS.
   Kept as one far-out stub; fragment when closer.

---

## Part 6 — Design-pass status (2026-06-17)

A grounded re-validation of the 8-piece sequence against the implementation on disk.
Parts 1–5 stand as captured; this part records what has shipped, resolves the Part-4
open questions, and fixes the forward sequence. It supersedes the Part-5.7 *ordering*
where they disagree (the piece definitions are unchanged).

### 6.1 Shipped state — Slice A is 2/3 done

| Piece | Key | State |
|---|---|---|
| 1 — Minimal governance exception (§II.A charter) | `-c732` | ✅ shipped `75257cb` |
| 2 — Threat/value tier config dial | `-1a2d` | ⬜ open — no `tier`/`floor`/`ceiling` keys in `project.json`; no consumer floor exists |
| 3 — Mutation oracle | `-f029` | ✅ shipped `6c85282` — advisory-only (floorless, never writes `last_test_result`, manually invoked) |
| 4 — Promote review skills → oracle-bound checkers | `-d186` | ⬜ open (large) |
| 5 — Maker/checker RALPH loop + stop rule | `-4c43` | ⬜ open (large) — depends on 2,3,4 |
| 6 — Plan-as-durable-diffable-state | `-424f` | ⬜ open (large) |
| 7 — Real Article II amendment | `-9360` | ⬜ blocked on ≥3 graduation round-trips |
| 8 — Gate taxonomy → debugging → v2 | `-9008` | ⬜ far out |

The §II.A charter (piece 1) being live means one bounded maker/checker round-trip is
already sanctioned; piece 3 gives one working (advisory) oracle. What remains in
Slice A is the floor that turns that oracle from "lists survivors" into "blocks below
a mutation-score threshold" — which is piece 2.

### 6.2 Open questions — re-validated, none block v1

- **Part 4 Q1 (deadlock/oscillation cap)** → answered by **§5.4**: `green-stop` on k dry
  rounds; `red-stop` (ceiling-below-floor → yield to human) is the oscillation escape.
  Same lineage as the implement 5-iter / design-ui 3-iter caps.
- **Part 4 Q3 (merge/synthesis oracle)** → answered by the **§5.2 added row**: the
  AC-conformance checker (every AC's test green on the integrated tree) IS the merge
  oracle. It is the existing `integrate` phase. The §2.4 "synthesis is a hard problem"
  caveat has a mechanical answer.
- **Part 4 Q2 (where reactivity lives)** + **Q4 (v2 rollback / kill switch)** → both are
  **v2**. v1 is turn-driven by design; reactivity is a v2 architecture change. Scoped
  out of v1.
- **§5.6 (brainstorm checker has no oracle)** → lean **option (b)**: force every
  brainstorm scope-cut to be a recorded explicit non-goal a later phase can challenge,
  turning "we dropped X" into a falsifiable claim. Deferrable — not on the Slice-A/B
  critical path.

Net: nothing genuinely blocks the v1 critical path; the remaining work is mechanical
sequencing, not unresolved design.

### 6.3 Validated forward sequence: 2 → 4 → 6 → 5

- **Piece 2 (tier dial) next** — small; the YAGNI objection dissolves now that the
  mutation oracle is a real, floorless consumer awaiting a floor. Piece 5's stop-rule
  cannot be specified without this dial.
- **Piece 4 (oracle-bound checker refit)** — the mutation oracle is a working template
  for an oracle-bound checker, and `spec-shippability-review` already emits
  BLOCKER/ADVISORY. Generalize the proof-obligation contract from those two.
- **Piece 6 (durable plan schema)** — the orchestration spine; mirrors `workflow.json`
  discipline.
- **Piece 5 (the loop)** — last, per the §5.7 dependency (after 2,3,4 exist).

Each remaining piece is its own intake → spec → approve cycle, triaged as an
`epic-child` of `-9d4c`, with its implementation run as a deliberate §II.A
maker/checker round-trip (banking toward the ≥3 that unblock piece 7).

---

## Part 7 — Re-orientation (2026-06-22)

A re-validation of the strategy against (a) what shipped since Part 6, and (b) the
velocity-instrumentation findings (`backlog.md → baseline-velocity-levers-...-v0lv`)
and the token-efficiency reference (`docs/references/token-efficiency.md`). The
8-piece sequence and the `2 → 4 → 6 → 5` ordering **still hold**; this part corrects
the Part-6 status table and sharpens *why* piece 6 is next and *how* it must be
designed. Parts 1–6 stand as captured; where Part 6's status table disagrees with
§7.1, §7.1 governs.

### 7.1 Corrected status — Part 6's table is stale

| Piece | Key | Part 6 (06-17) | **Reality (06-22)** |
|---|---|---|---|
| 1 — §II.A charter | `-c732` | ✅ shipped | ✅ shipped |
| 2 — tier dial | `-1a2d` | ⬜ open | **✅ shipped** (`hooks/lib/tier-dial.mjs`, `project.json → tier.level`) |
| 3 — mutation oracle | `-f029` | ✅ shipped (advisory) | ✅ shipped (advisory) |
| 4 — oracle-bound checker refit | `-d186` | ⬜ open | **🟡 partial** — 3 oracle-bound checkers live (spec-diagram, spec-traceability, spec-rollout-enforceability) + `harness/checker-fanout.mjs` live-wired (velocity Lever 1). Security/simplify/code-structure still open. |
| 5 — maker/checker RALPH loop | `-4c43` | ⬜ open | **🟡 partial** — bounded one-maker/one-checker machinery shipped (`harness/maker-checker.mjs` `assertBounded`, `evidence-ledger.mjs`, `graduation-gate.mjs`). Multi-round loop + stop-rule + arbitration open. |
| 6 — durable plan schema | `-424f` | ⬜ open | **✅ SHIPPED** (`harness/plan-store.mjs` — append-only versioned `.claude/state/plan/<slug>.json` + `mergeInput`; `plan-frame.readFrame` (the η lever); `plan-diff.diffVersions` (visible replan diff); `replan.applyReplan` (record-only primitive); `plan-wiring.mjs` (additive Tier-2 harness wiring behind `velocity.durable_plan.enabled`). Both consumers migrated additively (signatures + projections preserved): `evidence-ledger.recordRoundTripOnPlan`, `checker-fanout.mirrorVerdictToPlan` → plan `artifacts.{round_trips,verdicts}`. Built via a 7-task shared-mode swarm; **no Article II/IV amendment** (Decision D1: additive Tier-2 state, same class as `harness_state`/`checker-fanout`). |
| 7 — real Article II amendment | `-9360` | ⬜ blocked | **🟡 partially lifted** — the oracle-bound read-only checker *class* graduated (clause 6/7 lifted for that class only; evidence: 4 governed round-trips, 0 false-positive blocks, clean `/security`, ratification). Multi-maker / judgment-checker fan-out residual; gate is per-class, not blanket. |

`-424f` is **now shipped** (2026-06-22): the durable plan spine exists, and its two
prior ad-hoc consumers (`evidence-ledger.mjs`, the live `checker-fanout.mjs` verdicts)
now persist *through* it while keeping their on-disk projections for back-compat. The
plan is the "encoder" of §7.3: a worker reads only its per-node frame (`readFrame`),
every replan is a recorded diff (`applyReplan` → append-only `versions[]`, never a
silent mutation), and per-node results are the merge oracle's structured input
(`mergeInput`). Wiring it as **additive Tier-2 state** (not a mandatory phase) kept it
amendment-free — the OQ-1 default the reviewer approved at gate A.

**Next consumer: `-4c43`.** This spine is exactly what the maker/checker RALPH loop
was blocked on. `-4c43` now layers the *decide-when-to-replan* policy
(dry-round stop, ceiling-below-floor yield, oracle-over-judgment arbitration) on top
of the record-only `applyReplan` primitive shipped here — the seam drawn in the
`-424f` spec (§Decisions). The forward sequence collapses from `2 → 4 → 6 → 5` to its
tail: **piece 5 (`-4c43`) is now next**, then piece 4's residual checker refits.

### 7.2 Two objectives the strategy was conflating: latency vs token-cost

The velocity instrumentation forced a distinction the original vision left implicit:

- **Latency (wall-clock).** The velocity north star ("~2h run → ~20 min") is
  wall-clock. DATA POINT 1 showed runs are **~96% model-bound** — so latency ≈
  *serial* reasoning time. **Parallelism (checker fan-out, the v1 agent-team) is a
  latency play:** it runs independent reasoning concurrently. It does **not** reduce
  total tokens — N agents cost ~N× tokens to finish in ~1× time.
- **Token-cost.** `token-efficiency.md` is a *cost* play (output tokens at ~3× input).

These pull in tension: **v1's agent-team makes runs faster but potentially more
expensive.** The vision already carried the resolution (§2.2 / §103): spend the
parallelism budget on **adversarial oracle-bound checkers, not on N makers** —
checkers are cheaper and catch more. That is the cost-discipline that keeps the
latency win from blowing up the token bill. Stated as a rule for v1:

> Parallelize for latency where the work is genuinely independent; keep the *maker*
> count minimal; pay the parallelism tax on *grounded checking*, not on redundant
> generation.

### 7.3 The scenario-output mirage relocates the token-efficiency leverage

The load-bearing empirical finding (DATA POINT 6 diagnosis, `baseline-self-dev-verify`):
per-phase OUTPUT tokens are **~98% reasoning, ~2% artifacts** (the `tdd:scenario`
tick measured 117k output tokens but produced ~2.7k tokens of actual test/recipe
files). Consequences:

1. **Single-context output compression has a low ceiling.** Output token cost is
   irreducible reasoning — exactly `token-efficiency.md`'s own "computational
   compression is bounded by intrinsic complexity" caveat. Lever 4b-i (terse
   verdicts) confirmed this empirically: it only ever touched the small
   visible-restatement slice. **Compressing artifacts/narration is mostly a dead end.**
2. **Therefore `token-efficiency.md` is not an abstract north star — it is the design
   spec for piece 6.** Its real target is the *inter-agent state channel*, not one
   context's prose. In an agent team every worker re-reads shared context (DP cache-read
   deltas of 3M–8.5M tokens/phase dominate the priced-input side). The **plan is what
   each agent reads instead of the full history** — it *is* the "encoder" in the doc's
   communication-channel model. Maximize **η = I(plan; correct future actions) /
   plan-tokens**.
3. **Cost leverage that remains is "don't reason at all" + "don't re-serialize."**
   Right-size triage (Lever 2) cuts whole phases of reasoning for small diffs; a dense
   plan schema cuts per-worker context re-reads and the lossy re-serialization at merge
   (§2.4). Both are piece-6-adjacent.

### 7.4 What this hands to the `-424f` intake/spec

Piece 6 is the **convergence point**: the parallelism spine (latency) *and* the
compressed state channel (cost). Design directives, to be carried into its intake:

1. **Plan = sufficient statistic, not a transcript.** Schema: goal + tasklist +
   per-node assignment (the frame a worker reads) + version/diff history. A worker
   reads only its frame, never the whole history (§2.3 orchestrator-owns-cross-cutting-
   context; token-doc "minimal belief state").
2. **Replan = recorded diff, never silent mutation** — `workflow.json` lineage + the
   consent-gate pattern (§2.1).
3. **Per-node result schema is the merge oracle's input** — structured enough that the
   AC-conformance / `integrate` merge oracle (Part 6.2, Q3) integrates *mechanically*,
   attacking the §2.4 lossy-merge problem at the schema level rather than hoping
   synthesis is cheap.
4. **Unify the shipped consumers** — the plan object should subsume what
   `evidence-ledger.mjs` and the fan-out verdicts persist today, so the bounded
   round-trip writes plan-state, not a side ledger.
5. **Tier-dial-aware** — floor/ceiling per node read from `project.json → tier`
   (shipped, piece 2), so piece 5's stop-rule can be layered on without re-opening the
   schema.

Net: the development strategy holds. `-424f` is correctly next, is now grounded by
real consumers, and has a sharper design contract than Part 6 implied — it is the
piece where the velocity (latency) and token-efficiency (cost) threads are designed
together rather than traded off blindly.
