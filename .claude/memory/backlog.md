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
- verified-at: HEAD
- last-touched: 2026-06-01
- caveat: Full vision + audit captured at `docs/vision/baseline-v1-thought-compiler.md` (currently UNTRACKED — not in any commit yet; a future v1-design workflow should commit it). This is the big next epoch, NOT a quickfix. Sequence per the doc: (1) amend seed.md §Article II then CLAUDE.md to permit bounded agent-team execution under an orchestrator (workers decide inside an orchestrator-owned frame; scope/write_set escalation bounces up); (2) plan-as-durable-diffable-state schema (mirror workflow.json discipline); (3) maker/checker RALPH protocol with checkers BOUND TO MECHANICAL ORACLES (the load-bearing constraint — two LLMs alone agree on hallucinations); (4) the "safe vs ask-a-human" gate taxonomy BEFORE any autonomy; (5) AI-native debugging skill (explanation-trace as the reviewable object). Each of 1–5 deserves its own intake→spec→approve cycle. v2 (signal-driven AI-native OS: Sentry/GA4/CRM/CI connectors → diagnose → fix → deploy) rides on a trusted v1. Open questions (maker/checker deadlock cap, where reactivity lives, the merge/synthesis oracle, auto-deploy rollback + kill switch) are listed in the doc. **Decomposed 2026-06-05 into the 8 child entries below (keys `*-c732`, `*-1a2d`, `*-f029`, `*-d186`, `*-4c43`, `*-424f`, `*-9360`, `*-9008`). The refined checker mechanism + 8-piece sequencing live in the vision doc Part 5, which supersedes its Part 3.** This parent stays open as the epic umbrella; close it only when all 8 children are picked-up or dropped.

---

## threat-value-tier-config-dial-oracle-floors-1a2d

> verbatim (assistant, 2026-06-05):
> "Threat/value tier config dial — project.json tiers → which oracles are mandatory vs advisory, plus each checker's floor + ceiling values. Pure config, tiny, every checker reads it."

- source: assistant-deferral
- status: open
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: small
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: A
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: One dial sets BOTH the floor (quality threshold) and ceiling (effort budget) per checker, so "how hard do we search" and "know when to stop" are pinned config not per-run judgment. Same pattern as git.protected_branches. Foundational — every checker reads it. Detail: vision doc Part 5.4–5.5, piece 2.

---

## mutation-testing-oracle-for-tdd-checker-f029

> verbatim (assistant, 2026-06-05):
> "Mutation oracle for the TDD checker — the one genuinely new mechanical capability. Wire mutation testing as the test-quality oracle (mutation score, not coverage)."

- source: assistant-deferral
- status: picked-up
- raised-on: 2026-06-05
- raised-in-context: v1 thought-compiler design discussion (no active workflow)
- estimated-effort: medium
- parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
- slice: A
- verified-at: bcefe17
- last-touched: 2026-06-05
- caveat: Line coverage is the gameable fake oracle; mutation score is not — to raise it you must write tests that actually catch mutants. This is the TDD checker's "no shortcuts" teeth and gives the loop a clean stop (no surviving mutant). Dogfoodable on the baseline's own suite immediately. Detail: vision doc Part 5.2 + 5.7 piece 3. SHIPPED 2026-06-05 (commit 6c85282, `scripts/mutation-oracle.mjs`).
- superseded-at: 2026-06-05

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

## bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf

> verbatim (user, 2026-06-05):
> "Proceed; file critical separately" (mutation-oracle install checkpoint — chose to proceed with Stryker and file the pre-existing critical as its own item).

- source: user-instruction
- status: open
- raised-on: 2026-06-05
- raised-in-context: mutation-testing-oracle (-f029) npm-install audit checkpoint
- estimated-effort: small
- verified-at: 97ead55
- last-touched: 2026-06-05
- caveat: `npm audit` surfaced a CRITICAL in `liquidjs` (GHSA-gf2q-c269-pqgc RCE + XSS/ReDoS/DoS, 6 advisories) reachable via `@11ty/eleventy@3.1.5` → `liquidjs@10.25.7`, plus a moderate `ws` via eleventy-dev-server. PRE-EXISTING (not introduced by -f029; surfaced only because the Stryker install re-ran the audit). Dev-only (eleventy build/serve toolchain), not in the shipped consumer payload. Fix: a dedicated chore/bugfix to bump `@11ty/eleventy` (latest 3.x) or targeted `npm audit fix`, then re-audit — kept OUT of -f029 to avoid an eleventy major bump mid-feature. Detail: `docs/archive/2026-06-05/mutation-testing-oracle/security.md`.

---
