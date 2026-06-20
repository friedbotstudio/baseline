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

## extend-epic-approved-enforcement-to-bash-write-surface-abad

> verbatim (assistant security finding, 2026-06-10; promotion directed by user):
> "[MEDIUM] Bash redirect to the epic state file bypasses the guard. epic_approval_guard fires only on Write|Edit|MultiEdit; CONSENT_BASENAMES (Bash-write detection) covers consent tokens but NOT .claude/state/epic/. A `echo '{\"approved\":true}' > .claude/state/epic/<slug>.json` sets approved:true without passing the guard, and track_guard trusts the flag."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-10
- raised-in-context: harden-epic-approved-flip (security review, Phase 8)
- estimated-effort: small
- verified-at: 66fac2a
- last-touched: 2026-06-10
- caveat: Completeness gap in the just-shipped `epic_approval_guard` (commit pending). The guard makes the epic `approved: true` flip unforgeable on the file-write tool surface (the documented forgery path the harness uses), but the Bash write surface is uncovered — `lib/common.mjs` `CONSENT_BASENAMES`/`writesConsentPath` (consumed by `destructive_cmd_guard`) lists `commit_consent`/`push_consent`/`*_grant`/`spec_approvals/`/`swarm_approvals/` but NOT `.claude/state/epic/`. Since the spec deliberately left `track_guard`'s read side trusting `es.approved === true`, a Bash-set flag would be honored. Fix options: (a) extend `CONSENT_BASENAMES` / `destructive_cmd_guard` to block Bash writes under `.claude/state/epic/` that set `approved:true` (parity with consent-token Bash protection); or (b) adopt research Candidate C — have `track_guard` re-derive approval from the persistent token at read time, eliminating the trusted boolean. Was OUT of scope for harden-epic-approved-flip (its ACs modeled the Write/Edit/MultiEdit surface only). Full finding: `docs/archive/2026-06-10/harden-epic-approved-flip/security.md` (MEDIUM, OWASP A04 / CWE-862). Natural pairing with the `epic-close` / read-side-derivation work.

---

## audit-baseline-misses-docsite-prose-and-hooks-table-drift-9f31

> verbatim (assistant finding, 2026-06-11; promotion directed by user — "fix the workflows and hooks pages via a chore and record this failure for future backlog tracking"):
> The epic / epic-child feature (commits 66fac2a, 121078f) shipped in code, the constitution, and `workflows.jsonl`, but the docs site was never updated, and `audit-baseline` passed with fails=0 — the drift was silent. `derive-counts.mjs` keeps the `{{ baseline.* }}` numeric variables correct, but `audit-baseline` does not validate (a) `site-src/workflows.njk` hand-maintained prose ("Five selectable tracks", the track list omitting epic/epic-child, "All 22 hooks remain active") nor (b) that `site-src/hooks.njk`'s boundary table + per-hook enforcement table enumerate every hook on disk (epic_approval_guard and harness_continuation were BOTH absent, so the data-driven "23 hooks" header disagreed with a 21-row table).

- source: assistant-deferral
- status: open
- raised-on: 2026-06-11
- raised-in-context: fix-docsite-epic-drift (chore)
- estimated-effort: small
- verified-at: 121078f
- last-touched: 2026-06-11
- caveat: Fix = extend `audit-baseline` to validate the docs site's hand-maintained prose/tables against the same derived counts (`derive-counts.mjs`) it already cross-checks for CLAUDE.md / README / seed.md. Two concrete checks: (1) `workflows.njk` selectable-track count plus presence of one list entry per selectable `track_id` in `workflows.jsonl`; (2) `hooks.njk` per-hook enforcement table enumerates every `.claude/hooks/*.mjs`, and the by-event boundary table covers each one. Natural pairing with the four-way Article IV mirror check and the `/init-project doctor` `workflows.jsonl` drift check. The `fix-docsite-epic-drift` chore corrected the content; this item is the guardrail so the same class of drift cannot pass CI silently again.

---
