---
owners: [/memory-flush]
category: future-work intent
size-cap: 500
key: <slug>-<4char-hash>
verifies-against: none
stale-exempt: true
---

# Backlog

Future-work intent captured automatically by `memory_stop.mjs`. Curated into this file via `/memory-flush`. Stable key shape: `<8-word-kebab>-<4-char-sha256>`. Entries use `superseded-at:` as the closure trigger (auto-delete on the next `/memory-flush` Step 0a sweep); the body `status:` field disambiguates whether the entry was `picked-up` (taken into a workflow) or `dropped` (decided not to do). Entries are decay-exempt: they do not stale-age regardless of `verified-at:` distance (see the stale-exempt carve-out in `memory_session_start.mjs` and `sweep.mjs`).

---

## baseline-v1-thought-compiler-agent-team-plan-mode-9d4c

> verbatim (user, 2026-06-01):
> We need to amend the constitution first to allow Agent team system with multiple parallel agents working of parts like check and balance ... The main thread is the orchestrator and other threads are background worker agents ... the spec after approval must trigger plan mode for orchestration ... The plan is executed by one or multiple maker nodes, and one or more checker nodes are used to review and critique the solution in a RALPH loop ... Once we build this level of machinary we will label it baseline v1 (a thought compiler).

- source: user-instruction
- status: open
- raised-on: 2026-06-01
- raised-in-context: vision conversation (branched /btw session) during the changelog-classify-from-entries workflow
- estimated-effort: large
- verified-at: 21556a5
- last-touched: 2026-06-17
- caveat: Full vision + audit captured at `docs/vision/baseline-v1-thought-compiler.md` (tracked; vision committed in 75257cb, design-pass status in Part 6). This is the big next epoch, NOT a quickfix. Sequence per the doc: (1) amend seed.md §Article II then CLAUDE.md to permit bounded agent-team execution under an orchestrator (workers decide inside an orchestrator-owned frame; scope/write_set escalation bounces up); (2) plan-as-durable-diffable-state schema (mirror workflow.json discipline); (3) maker/checker RALPH protocol with checkers BOUND TO MECHANICAL ORACLES (the load-bearing constraint — two LLMs alone agree on hallucinations); (4) the "safe vs ask-a-human" gate taxonomy BEFORE any autonomy; (5) AI-native debugging skill (explanation-trace as the reviewable object). Each of 1–5 deserves its own intake→spec→approve cycle. v2 (signal-driven AI-native OS: Sentry/GA4/CRM/CI connectors → diagnose → fix → deploy) rides on a trusted v1. Open questions (maker/checker deadlock cap, where reactivity lives, the merge/synthesis oracle, auto-deploy rollback + kill switch) are listed in the doc. **Decomposed 2026-06-05 into the 8 child entries below (keys `*-c732`, `*-1a2d`, `*-f029`, `*-d186`, `*-4c43`, `*-424f`, `*-9360`, `*-9008`). The refined checker mechanism + 8-piece sequencing live in the vision doc Part 5, which supersedes its Part 3.** This parent stays open as the epic umbrella; close it only when all 8 children are picked-up or dropped. **Design-pass status (2026-06-17): Slice A is 2/3 done — piece 1 (`-c732`, §II.A charter, 75257cb) and piece 3 (`-f029`, mutation oracle, 6c85282) shipped; the mutation oracle is advisory-only (floorless, never writes last_test_result). Validated forward sequence: 2→4→6→5. Open questions resolved — Q1→§5.4 (green/red stop), Q3→§5.2 AC-conformance = merge oracle; Q2/Q4 deferred to v2; §5.6 leans option (b). Full status: vision doc Part 6.**

---

## promote-review-skills-to-oracle-bound-checkers-d186

> verbatim (assistant, 2026-06-05):
> "Promote existing review skills to oracle-bound checkers — refit spec-lint / spec-diagram-review / security / simplify / code-structure to emit the proof-obligation contract: artifact → block, assertion → advisory → backlog."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: large
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: B (depends on slice A)
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: The checkers already exist on disk — this is re-wiring, not greenfield. Every finding carries a proof obligation: concrete artifact → can block; bare assertion → advisory, labeled low-confidence, logged to backlog with its proof. Maps brainstorm/spec/tdd/security/review/AC-conformance onto shipped skills (vision doc Part 5.3). Detail: Part 5.7 piece 4.

---

## maker-checker-ralph-protocol-stop-rule-arbitration-4c43

> verbatim (assistant, 2026-06-05):
> "Maker/checker RALPH protocol + stop rule + arbitration — floor→advisory, dry-rounds→stop, ceiling-below-floor→yield, plus the oracle-over-judgment precedence ordering."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: large
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: B (depends on pieces 2, 3, 4)
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: The loop itself. Load-bearing rule: ceiling-below-floor is a RED state (yield to human), never silently downgraded to advisory — otherwise it recreates the verify_pass_guard PASS-when-FAIL failure. Arbitration: oracle-bound findings outrank judgment always; two oracle-bound conflicts mean the SPEC is wrong → existing needs-spec-change yield. Maker is nearly free (reuse implement skill). Detail: vision doc Part 5.4–5.5, piece 5.

---

## plan-as-durable-diffable-state-schema-424f

> verbatim (assistant, 2026-06-05):
> "Plan-as-durable-diffable-state — .claude/state/plan/<slug>.json schema; replan = recorded diff; mirrors workflow.json discipline + consent-gate pattern. The orchestration spine."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: large
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: B
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: Mid-flight replanning is only safe if the plan is durable on-disk versioned state where a replan is a visible DIFF, not a silent mutation — same lineage as workflow.json. Goal + tasklist + per-node assignments + version/diff history. Spec → approve → plan → execute is the missing connective tissue (vision doc §2.1). Detail: Part 5.7 piece 6.

---

## real-article-ii-amendment-after-prototype-9360

> verbatim (assistant, 2026-06-05):
> "The real Article II amendment — written AFTER 1–6 are prototyped, blessing what was actually learned (supersedes the minimal exception from piece 1)."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: medium
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: C (after slices A+B prototyped)
- verified-at: a63bbbe
- last-touched: 2026-06-05
- blocked-on: §II.A graduation criteria (≥3 governed maker→checker round-trips all-mechanical-blocking, zero false-positive blocking findings, clean /security on checker oracle artifacts, maintainer ratification)
- caveat: RESCOPED 2026-06-06. The original "real Article II amendment after prototype" role was filled by `-c732` (the definitive §II.A bounded maker/checker charter, landed in seed.md §4.2 + mirrors + annex). `-9360` is now the **graduation-gated permanent Article II rewrite that lifts the §II.A one-maker/one-checker cap to multi-agent** (multiple makers/checkers, durable plan schema, tier dial). It no longer supersedes `-c732` — `-c732` absorbed `-9360`'s charter role; this entry is the future cap-lift. Children `-1a2d`, `-f029`, `-424f`, `-9008` still depend on it. Detail: vision doc §2.3 + Part 5.7 piece 7; charter narrative in `.claude/CONSTITUTION.md` §1/§2 "§II.A — bounded maker/checker charter".

---

## gate-taxonomy-then-debugging-skill-then-v2-9008

> verbatim (assistant, 2026-06-05):
> "Gate taxonomy → AI-native debugging skill → v2 — safe-vs-ask-a-human classifier, then the explanation-trace debugging UX, then the signal-driven OS. Kept as one far-out stub; fragment when closer."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: large
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: C (far out — deliberately coarse)
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: Deliberately coarse — build the gate taxonomy BEFORE any autonomy (vision doc §2.4); the debugging skill makes the explanation-trace the reviewable object (§2.5); v2 is the signal-driven OS riding on a trusted v1 (§2.6, §1.3). Fragment into separate intakes when v1 is proven. Detail: vision doc Part 5.7 piece 8.

---

## spec-rollout-prerequisite-enforceability-oracle-checker-419d

> verbatim (user, 2026-06-10):
> "with our maker-checker architecture coming into form thanks to v1 vision, I am inclining towards b but you can validate and confirm" — validated and confirmed as option (b)-with-structured-artifact; "record this against Q-002 and queue it on the backlog".

- source: user-instruction
- status: open
- raised-on: 2026-06-10
- raised-in-context: standup follow-up (no active workflow) — resolution of pending-questions Q-002
- estimated-effort: medium
- verified-at: 66fac2a
- last-touched: 2026-06-10
- caveat: Resolves Q-002 (silent-failure prerequisites shipped unenforced — origin: the 2026-05-14 GitHub Pages `build_type=workflow` prerequisite, judgment-flagged 3× yet never given an enforcement AC). Build a new `spec-rollout-enforceability-review` skill in the spec-review family (alongside `spec-diagram-review` / `spec-traceability-review` / `spec-shippability-review`), oracle-bound from day one per the maker-checker proof-obligation contract (`-4c43`, `-d186`). Design = option (b) carrying a sliver of (a): (1) amend the spec format so the Rollout section's prerequisites are a STRUCTURED block — one row per prerequisite, each with an explicit `enforced-by: AC-NNN` pointer to an enforcement-type AC (preflight / smoke / error-mapping); (2) the checker mechanically verifies every prerequisite row has a non-empty `enforced-by` resolving to a real enforcement-type AC. Missing/dangling pointer → BLOCKER (hard-blocks `/approve-spec`, same as the other spec-review BLOCKERs); a prerequisite still living in free prose (un-structured) → ADVISORY. The structured `enforced-by:` field IS the mechanical oracle — a free-prose-only scan would be LLM-judgment and the contract forbids LLM-judgment from blocking (two LLMs agree on hallucinations). Concrete remediation for the origin bug also lives here: `scripts/bootstrap-pages.mjs` (`gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow`) and/or a fail-fast preflight in `release.yml`. Ships standalone now (useful immediately, independent of the rest of v1); later inducted into the oracle-bound-checker refit `-d186`, where it serves as a concrete fourth example to generalize the proof-obligation contract from. NOT a child of the v1 epic umbrella (`-9d4c`) — it's a standalone checker that the epic's slice B later absorbs by reference.

---

## baseline-velocity-levers-after-lever0-timing-v0lv

> verbatim (user, 2026-06-21):
> "I'd suggest we need to make baseline development faster i.e. right now baseline is slow (one feature takes ~1-3 hours) we need a strategy to make this faster ~20 minutes for a ~2 hours run"

- source: user-instruction
- status: open
- raised-on: 2026-06-21
- raised-in-context: baseline-velocity strategy discussion → `phase-timing-instrumentation` (Lever 0 shipped)
- estimated-effort: large (multi-lever, sequenced)
- verified-at: 0bb2753
- last-touched: 2026-06-21
- caveat: Strategy = stack multiplicative levers toward ~6× (no single lever suffices). **Lever 0 (measure-first) SHIPPED** as `phase-timing-instrumentation`: per-phase model-vs-human-wait timing via the `phase_timer` hook → `timing.md` in the archive bundle. The remaining levers, to be RANKED BY THE TIMING DATA once a few full runs accrue: **(1) parallelize the read-only checker fan-outs** (the 4 spec-review skills + lint, and scout∥research — Article II already permits pre-decided recipes in parallel; cleanest architectural win); **(2) right-size triage** so hook/skill/doc changes skip the heavy spec+diagram+4-review apparatus (biggest lever for typical baseline-on-baseline work); **(3) model/effort tiering** — mechanical phases (simplify/verify/integrate/archive/memory-flush) on a cheaper tier, judgment phases (spec/security/design) on the strong model; **(4) terser artifacts for internal dev** (output tokens dominate latency; gate diagram/verbosity by write_set); **(5) collapse human round-trips** — front-load gate decisions into one sitting, fast-path gate A for low-risk diffs (dominant lever IF timing shows the run is human-wait-bound). The critical unknown the timing data resolves: is a run model-generation-bound or human-wait-bound? That flips the ranking. Connects to the v1 thought-compiler epic (`-9d4c`): Levers 1+3 are the cheap-end of the same parallel maker/checker north star. NOTE the first real `timing.md` (this workflow's own bundle) collapsed pre-hook phases — a clean ranking needs a full run AFTER this ships. **DATA POINT 1 (2026-06-21, `audit-baseline-docsite-drift`, tdd-quickfix, ~70-line single-file diff, full run incl. commit, reconstructed from the harness log since `timing.md` collapses the tdd worker-chain): total 20m24s = 1224s. Split: ~96% model-bound, ~4% human-wait — the ONLY human pause was the 54s grant-commit gate. Per-phase: tdd 8m34s/42% (coordinator 220s · scenario 88s · implement 111s incl. `npm run build` · verify 51s · drift+finalize 21s), integrate 4m10s/20% (full serial 993-test suite — serial by the `live-objtemplate-rebuild-races` landmine), commit 1m59s/10%, simplify 69s, document 63s, grant-commit wait 54s, security 49s, memory-flush 40s, archive 31s, cli-copy-review 19s, preflight 16s. RANKING IMPLICATION for this track-type: run is MODEL-BOUND → Lever 5 (collapse human round-trips) caps at the 4%, NOT dominant. Top levers confirmed by this data: Lever 2 (right-size triage) — ~4-5min of the 20 was fixed apparatus (security+document+simplify+archive+memory-flush+cli-copy-review) a 70-line single-file quickfix shouldn't fully pay; and the redundant-verification observation (NOT yet a listed lever, ADD IT): the audit ran inside verify-tick (51s) AND again in simplify (~60s), then integrate ran the heavier full node --test suite (250s) — three heavyweight verification passes for one change; verify+simplify re-running the same audit is pure duplication (integrate's serial run is a deliberate determinism trade-off, leave it). CAVEAT: one data point, one track-type (small structural-audit extension). spec-entry/swarm/epic runs have real gate-A human-wait and will shift the split — need ≥1 clean sample per track-type before ranking confidently. This is the first clean tdd-quickfix sample.** **TOKEN-CAPTURE AXIS SHIPPED (2026-06-21, `phase-token-instrumentation`):** Lever 0's measurement now has its second dimension — `phase_timer` + `lib/timing.mjs` capture cumulative output/input/cache-read tokens from the session transcript and render per-phase token deltas in `timing.md` alongside the time columns, anchored on a `run-start` baseline that counts only transcript entries timestamped at/before `workflow.created_at` (so phase-1 reflects in-workflow work, not the whole pre-workflow session). This makes the info-per-token ranking (η = decision-relevant-info / tokens, from `docs/references/token-efficiency.md`) computable from real data instead of intuition — directly serves the "which lever" question. **DATA POINT 2 (this run's own bundle, `phase-token-instrumentation`, tdd-quickfix): per-phase OUTPUT tokens — simplify 62430 (highest, and it made ZERO edits → confirms terser-internal-artifacts Lever 4 + redundant-verification waste are real output-token sinks), document 21350, security 12961, integrate 11863, tdd 0 (bootstrap artifact: the tdd stamp was written before this feature's own cutoff-fix rework, so that rework's tokens spilled into simplify's delta — future clean runs won't have this). Cache-read deltas are 3M–8.5M per phase, showing context size dominates the priced-input side. IMPLICATION: output-token cost is NOT proportional to edits made (simplify did nothing yet cost the most output) — it tracks reasoning/narration volume, reinforcing Lever 4 (terser internal artifacts) and the "compress persisted artifacts, not live reasoning" scoping from the token-efficiency reference (`docs/references/token-efficiency.md`).** Still OPEN: the lever-ranking + lever-implementation work remains; this only shipped the second measurement axis. **DATA POINT 3 — RECONSTRUCTED (hook-capture lost; instrumentation gap, 2026-06-21, `spec-tdd-artifact-compression`, the first intake-full/spec-entry sample): the `phase_timer` `timing.md` rendered EMPTY (header-only) so it was hand-reconstructed from the harness log into `docs/archive/2026-06-21/spec-tdd-artifact-compression/timing.md` — total 90m26s (~4.5× DATA POINT 1's quickfix); implement 28% + security 12% dominate; security's 11m is a full second fix-loop (findings→tests→code→build). KEY CROSS-TRACK FINDING: track-type flips whether a run is model-bound (quickfix, DP1) or decision-latency-bound (intake-full-with-findings, DP3) → Lever 5 (collapse human round-trips) matters HERE (~7 decision gates) but not for quickfixes. ROOT CAUSE of the empty render: `phase_timer` stamps on `completed[]` growth via the Write/Edit/MultiEdit PostToolUse matcher, but this run was driven by a manual harness loop that appended to `workflow.json` via Bash `node` scripts — the hook never saw a tracked tool-Write, so zero phase stamps were captured. IMPLICATION (actionable, ADD AS A MEASUREMENT-RELIABILITY FIX before trusting cross-track data): the timing/token instrumentation only fires when phase-state transitions go through the Write/Edit tools, NOT Bash `>`/node-fs writes. Either (a) make the phase skills write `completed[]` via the Write tool (most already do; the gap is when the orchestrator drives state manually), or (b) add a Bash-side `phase_timer` trigger on `workflow.json` mutation. Until fixed, any human/Bash-driven harness run produces no timing — so the clean spec-entry/epic samples the ranking needs can be silently lost. This was a real intake-full run (full pipeline incl. gate-A human-wait + a security fix-loop) whose timing would have been the most valuable sample yet.** **LEVER 4 SHIPPED 2026-06-21** as `spec-tdd-artifact-compression` (write_set-gated diagram profiles + tdd-state pointers; full design in `decisions.md → artifact-compression-writeset-diagram-profiles-sensitive-full-2026-06-21`). Entry stays OPEN — Levers 1/2/3/5 + the cross-track lever-ranking remain; do NOT close this umbrella on a single-lever workflow.** **MEASUREMENT-RELIABILITY FIX LANDED 2026-06-21** as `phase-timer-bash-trigger` (tdd-quickfix): DATA POINT 3's actionable gap is closed via option (b) — `phase_timer` gained a PostToolUse **Bash leg** (on `tool_name:'Bash'` it skips the file_path/basename check and unconditionally calls the idempotent `stampFromWorkflow`) + a `settings.json`/`src/settings.template.json` Bash matcher. Bash-driven `workflow.json` mutations (the manual-harness `>`/node-fs/jq path that silently lost DP3's timing) now stamp. Cross-track samples can no longer be silently lost to the Write-only matcher. **DATA POINT 4 (2026-06-21, `phase-timer-bash-trigger`, tdd-quickfix — the FIRST run to self-measure with live token capture, no reconstruction): pre-commit per-phase Model-ms / OUTPUT-tokens — tdd 878s/95391 (dominant: scenario+implement+verify+a drive-by settings-template mirror fix), document 244s/27592 (4 doc surfaces incl. constitutional + seed mirrors), security 134s/14531, simplify 123s/7596 (near-zero edits yet 7.6k out — again confirms simplify is an output sink), integrate 98s/4502. ALL human-wait 0 (no gate-A on quickfix; grant-commit gate lands after this render). Total model ≈ 1477s ≈ 24.6min pre-commit. Cross-check vs DP1 (also tdd-quickfix, 20m incl. commit, reconstructed): consistent track-type cost; this one's tdd phase is heavier because it absorbed the template-mirror drive-by. CONFIRMS DP2's finding that simplify's output cost is decoupled from edits made. This is now the cleanest tdd-quickfix sample — captured by the very hook this workflow fixed.**

---

## seed-template-mirror-parity-no-autosync-6c71

> verbatim (assistant finding, 2026-06-21):
> "commit 77b58ad shipped the seed-template-parity test red — it edited docs/init/seed.md §18.9 but not the src/seed.template.md mirror; no build step auto-syncs them (build-template.sh:184 only copies template→obj). This workflow fixed the 2-line drift as a drive-by."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-21
- raised-in-context: spec-tdd-artifact-compression (full-suite run surfaced a pre-existing red parity test)
- estimated-effort: small
- verified-at: 77b58ad
- last-touched: 2026-06-21
- caveat: `src/seed.template.md` (the SHIPPED genesis, copied to `obj/template/docs/init/seed.md` at `build-template.sh:184`) and `docs/init/seed.md` (the LIVE/dev genesis) must stay byte-identical §17-onward (enforced by `tests/seed-template-parity.test.mjs`), but they are **hand-maintained mirrors with no auto-sync** — `77b58ad` updated the live §18.9 epic-child token-derivation text and missed the template, shipping the parity test RED. Two things to fix: (1) **the real question — why didn't `77b58ad`'s workflow `/integrate` catch a red full-suite run?** Either integrate was bypassed/excepted, or the suite wasn't run, or the test post-dates that run. Investigate before trusting integrate as a gate. (2) Consider a guard/build-step that auto-syncs or at least FAILS LOUD on the seed↔template §17 divergence at build time (not just in the test suite), so a missed mirror can't ship. The drive-by fix this workflow applied closed the immediate 2-line drift; the process gap remains. NOT a child of `-v0lv` (separate concern: governance-mirror hygiene, not velocity).
