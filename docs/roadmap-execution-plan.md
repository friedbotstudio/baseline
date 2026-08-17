# Baseline — execution roadmap

This is the delivery tracker for the repo, written in the format the tooling parses. `standup` reads
progress from it, `sprint-planner` computes per-task readiness from it, and `roadmap-sync` (Phase 10.6)
writes back to it, flipping the tasks named in `workflow.json → roadmap_tasks[]` from planned to done
and promoting the epic heading as its body fills in.

It is the single live plan. Two programs used to be tracked separately and turned out to be one: the
disease-cure change-orders in `docs/handoff/` and the v1 thought-compiler epic in
`.claude/memory/backlog.md`. Decision Ledger #0002 said so directly — "V1 and V2 share a spine; the
roadmaps thought to be parallel converge at classification." The quality-oracle change-order and the
oracle-bound-checker backlog children are therefore one line item here, not two.

The reasoning behind each change-order is not in this file. It lives in
`docs/handoff/baseline-system-redesign-roadmap.md` and the briefs beside it. This file records only
what is done, what is next, and what blocks what.

Status markers are planned, in progress, and done. A task carries exactly one. An epic heading carries
the roll-up of its body.

## Progress

- **Status (2026-08-04):** HEAD is `6464a58`. **Epic 7 opens** with slices A–D ✅, landed as a five-commit
  `power` batch (`e7f00de`..`6464a58`). Epic 6 T10 ✅. The measurable outcome is that decisions reading
  stale went 26 to 0 and whole-store stale 173 to 147, because decision expiry is now supersession-driven
  rather than time-driven. Open: Epic 7 E and F, Epic 6 T8. The parent epic `living-system-model` stays
  open while E and F are unbuilt, and closing it later needs the standalone `epic_close.mjs` path, since
  the fold only fires on an `epic-child` track. T8 is annotated rather than flipped — Epic 7 slice C
  answers the same surfacing problem by a different mechanism, and calling that "T8 delivered" would be
  inference, which this file does not do.
- **Status (2026-07-24):** HEAD is `b6233f5`. No roadmap line-item moved since the 2026-07-21 snapshot —
  the two commits landed since (`f84e4ba` right-size gate scoped to the workflow diff and excluding test
  lines; `b6233f5` sharded-reader test counts derived from the fixture) both harden already-✅ work
  (Epic 4 D2 Lever 2 and Epic 6 T4). Open work is unchanged: Epic 5 (S3 stale-lock recovery, S4 dogfood
  config) and Epic 6 (T2, T8, T9). All five re-verified open on disk this date.
- **Status (2026-07-21):** Epics 1–4 are all ✅. Epic 5 S2 landed as `0312ffa` — the SDK-to-consumer
  path delivered via esbuild build-time bundling (`build-template.sh` Stage 1.7), superseding the
  own-package/`npx` plan, which unblocks S4. Remaining open work: Epic 5 (S3 stale-lock recovery, S4
  dogfood config) and Epic 6 (T2, T8, T9). Nothing open sits on the center-loop critical path — that
  loop (Epics 2 + 3) closed 2026-07-16.
- **Status (2026-07-16):** the center loop is **closed** — Epic 2 (input half) and Epic 3 (enforcement
  half, C1–C6) are both ✅. C6 gate taxonomy landed as `5cc959a`. Remaining open work lives in Epic 4
  (D2 in-progress, D3/CO-E planned), Epic 5 (S2/S3/S4), and Epic 6 (T2, T4). The bullets below are the
  original planning rationale, kept as the build-order record.
- Epics 2 and 3 form one loop, and that loop is the center of the plan. The bar a human sets upstream
  (Epic 2) is the rubric a machine oracle enforces downstream (Epic 3). Epics 4, 5, and 6 sit around it.
- Critical path: B1 (spec quality floor), then C4 (design-judge). C4 hard-depends on B1 for its rubric
  and on nothing else. Without that anchor the judge has nothing to score against.
- Epic 2's classifier extends machinery already on disk. The threat/value tier dial is the mechanical
  floor Decision Ledger #0002 D8 asks for, so A1 should widen it instead of standing up a second
  classifier.
- Epics 3, 4, and 5 each carry landed work. Epic 6 is carried debt and blocks nothing.

## Epic 1 — Foundations landed  ✅  (landed)

Standing policy and the periphery amendments. All landed; kept here for the record.

- ✅ F1. Phase 0 freeze on machine-churn — stop starting governance/tooling/roadmap workflows unless a product workflow is provably blocked. Standing policy, recorded in `decisions.md → freeze-machine-churn-2026-07-09`.
- ✅ F2. context7 becomes an outcome-mandate, not a tool-mandate (Article VI.5). Any current-docs source satisfies it; no irreplaceable dependency.
- ✅ F3. Read before overwrite (Article VI.7) — Write refuses to blind-overwrite an unread file.
- ✅ F4. Research retrieve-first — `research/retrieve.mjs` grounds the memo in fetched docs rather than training-data recall.
- ✅ F5. YAGNI positive-purpose reframe (Article VI.4) — YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope.

## Epic 2 — Input half: the bar gets set  ✅  (input)

Thin human input yields a thin spec, and a thin spec passes every downstream gate. This epic makes
authorization mean demonstrated understanding plus risk acceptance (Decision Ledger #0002), then
encodes that bar in the spec artifact so the enforcement half has something real to score against.

- ✅ A1. Governance Class classifier with a mechanical floor from blast radius. EXTEND the shipped threat/value tier dial (`project.json → security.tier`, already read by the checker fan-out; `decisions.md → tier-dial-oracle-floors-2026-06-16`) — Ledger #0002 D8 states the tier dial IS this floor. Do not build a parallel classifier. Claude may raise a class, never lower it below the floor.
- ✅ A2. Evidence-shape ladder — D authorize, C understanding, B plus reasoning, A plus alternatives, tradeoffs, confidence. Class determines the SHAPE of evidence, never its duration, word count, or authorship (D3: AI assistance is never penalized).
- ✅ A3. `discipline.mjs` — extend `scanTurn` to forbid multiple-choice on load-bearing probes, in addition to the existing ban on proposing solutions. A click is the weakest provenance rung; open questions are what upgrade it to a cognition trace.
- ✅ A4. Retrofit the `/approve-spec` marker to be GENERATED FROM a provenance-anchored ledger entry, not written alongside one. Scope is the `/approve-spec` gate ONLY — `/grant-commit` and `/approve-swarm` stay direct authorization (Ledger #0002: "Alpha is a retrofit, not a greenfield").
- ✅ A5. Class-drive `workflow.json → skip_brainstorm` — Class D skips; Class A and B cannot.
- ✅ B1. Spec quality floor — upgrade `spec_design_calls_guard`, `/spec-lint`, and the `/spec` template from "a Design calls section is populated" to "a reference target and quality acceptance criteria are present" for any spec whose `write_set` intersects `tdd.ui_globs`. The reference target IS the rubric C4 scores against; this is the hand-off point between input and enforcement.

## Epic 3 — Enforcement half: the bar gets enforced  ✅  (enforce)

A checker only self-corrects when it stands on a mechanical oracle. Two LLMs left to converse will
agree on a hallucination. This epic gives the pipeline an oracle for quality rather than conformance,
and lets it fail the build instead of filing an advisory.

- ✅ C1. Durable plan state — `.claude/state/plan/<slug>.json`, every replan an auditable diff rather than a silent mutation. Backlog `-424f`.
- ✅ C2. Promote review skills to oracle-bound checkers. Backlog `-d186`. Landed: `spec-diagram-review` and `spec-traceability-review` oracles, plus the parallel `checker-fanout.mjs` runner with deterministic merge. Open: refit `security`, `simplify`, and `code-structure`; the deferred diagram checks (class-to-DDL, AC-to-sequence, Container-to-Component).
- ✅ C3. Maker/checker RALPH protocol. Backlog `-4c43`. Landed: the bounded one-maker/one-checker round-trip (`maker-checker.mjs`, append-only `evidence-ledger.mjs`, fail-closed `graduation-gate.mjs`). Open: the multi-round loop, the stop rule, and arbitration. Ceiling-hit-below-floor is a RED state that yields to a human — never a silent downgrade to advisory.
- ✅ C4. Design-judge — the first quality oracle WITH TEETH. Playwright captures the rendered screen; the judge scores it against the spec's reference target from B1; below threshold FAILS `verify`. HARD-DEPENDS on B1 for the rubric, and on nothing else — CO-A improves the specs it reads but does not block it.
- ✅ C5. Prove the framework is general — ride at least one non-UI oracle (mutation score for TDD, or AC-conformance as the merge oracle) on the same checker interface, so it is not a one-off UI hack.
- ✅ C6. Gate taxonomy — the safe-versus-ask-a-human classifier, built BEFORE any autonomy. Backlog `-9008`; deliberately coarse, fragment when closer.

## Epic 4 — Velocity: reclaim the calendar  ✅  (velocity)

Peripheral to the center of the plan, and the cheapest wins on the board.

- ✅ D1. Notifier — ping the human at consent-gate and failure yields, batched, gates-only, with presence-aware suppression and idle-stop pings. Attention is a governed resource.
- ✅ D2. Velocity levers umbrella. Backlog `-v0lv`. Landed: Lever 0 (per-phase timing and token instrumentation), Lever 1 (parallel checker fan-out), Lever 2 (right-size gate), Lever 4 (artifact compression, terse verdicts, re-verify skip). Open: cross-track lever ranking. Lever 3 (model tiering) is architecturally constrained — main-context phases run at the session model, and Article II keeps judgment in main context.
- ✅ D3. Gate-collapse — fold three human gates into two higher-signal ones: approve-direction (intake plus the reference target) and approve-landing (commit). Depends on A4 (a collapsed gate is only safe when the single approval carries real evidence) and D1 (fewer gates only helps if the human is told when each fires).

## Epic 5 — Multi-session coordination  ✅  (org)

Peer sessions coordinating on one body of work (Article X). Opt-in, off by default, requires git.

- ✅ S1. Sprint completeness oracle, the MCP coordination channel core, the dispatch engine, and the org-team charter with broker-pool coordination.
- ✅ S2. Deliver the SDK-to-consumer path so the MCP SDK reaches consumer installs while the baseline stays zero-runtime-dep — landed via **esbuild build-time bundling** (`scripts/bundle-mcp-servers.mjs` + `build-template.sh` Stage 1.7), which inlines the SDK + zod into self-contained shipped `server.mjs` artifacts. This **supersedes** the original own-package/`npx` mechanism (first-party servers are compiled, not published). Backlog `sprint-channel-own-package-sdk-delivery-ac005-slice-c`. Unblocks the dogfood.
- ✅ S3. Stale-lock TTL recovery in `sprint-channel/lib/lock.mjs` — a holder that dies mid-task currently leaks the lock permanently and the task becomes unclaimable.
- ✅ S4. Sprint-mode dogfood config — register the `sprint-channel` stdio server in `.mcp.json` + `src/.mcp.template.json` (a three-to-four MCP-count cascade across the governance surfaces). `sprint-pool` stays a dev-launched channel server (broker over `--dangerously-load-development-channels`), not a shipped stdio entry; `velocity.sprint_mode.enabled` is already on. The SDK-to-consumer path is provided by S2's bundle, so consumers no longer get a broken server.

## Epic 6 — Debt and hardening  ✅  (debt)

Carried debt. Nothing on the critical path waits for it, so pick items up between features.

- ✅ T1. Bound the slug quantifier in `plan-store.mjs` so an over-long slug is refused by a clean named error instead of crashing at write time with ENAMETOOLONG. Backlog `-8b21`; one regex quantifier plus one scenario row.
- ✅ T2. Hoist a single slug validator once a third caller appears. Backlog `-9f4f`. The rule is REJECT, never normalize — do not consolidate by routing every site through `canonicalSlug`, which would mask traversals repo-wide.
- ✅ T3. Make generators stamp a derived header so a hand-edit is visibly wrong. Backlog `-e9c1`. The design call is the work: a header collides with the byte-equality contracts on the constitution mirrors, whose live files are the sources and cannot honestly carry a do-not-edit banner.
- ✅ T4. Memory-system redesign — make a captured lesson an ACTIVE constraint at the moment of the relevant decision, not a passive archive that only helps if a phase happens to read it. Backlog `-7f3a`; needs its own intake-to-approve cycle, do not quickfix.
- ✅ T5. Declare a release model in `project.json` (ci/cd model, release branch, trigger, cycle, consumer upgrade cadence) and teach `standup` to read it, so the "can this unreleased pile ship?" question becomes answerable from policy rather than guessed. Backlog `-a4f2`.
- ✅ T6. Stop the `memory_stop` extractor re-ingesting its own flush reports and mining SKILL.md contract prose. The suppression already existed but was anchored to a 64-character head window, which any re-invocation preamble defeats.
- ✅ T7. Derive a workflow's `exceptions` from the chosen track's DAG, so no phase skill can declare a prereq its own track is structurally unable to satisfy. Consent gates are never excepted; a track's `internal_phases` are resolved at runtime by the skill that owns them.
- ✅ T8. Refine the sharded memory store's decision-point surfacing from coarse category-level `scope:` backfill to precise per-entry scope tags. Backlog `-2902`; per-entry curation as `/memory-sync` re-verifies, so a `docs/specs/**` write surfaces only the genuinely load-bearing lessons rather than a 76-fact bounded index. **Re-read before picking this up.** Epic 7 slice C answers the same surfacing problem from the other side: a second trigger keyed on `governs:` path globs, plus a `load_bearing:` marker, with `scope: any` kept deliberately coarse (epic decision D7 — a per-category default is what produced `scope: [spec]` on decisions and caused the defect in the first place). Left open rather than closed because that is a different mechanism, not this one delivered.
- ✅ T10. Gate Phase 10 documentation routing on delegate receipts. The routing rule already existed in `document/SKILL.md` prose and was skipped anyway during this cycle's own Phase 10, sending a public page to the `documentation` style guide instead of `technical-writer`. `document-gate.mjs` now recomputes the required surface-to-delegate map from `project.json → document.surfaces` and exits 1 unless every required delegate left a receipt; `prose` gains the reader-level pass it never ran. Backlog `-4a1c` records the remaining limitation: the map is page-granular, so it over-demands on a one-word fix and under-demands when behaviour changes without a page changing.
- ✅ T9. Fix the consent-expiry edge exposed by the T4 landing: a landing longer than the 900s TTL, plus `/commit` archiving `workflow.json` before the commit, drops workflow-scoped consent to time-window mode and forces a re-grant. Backlog `-7af6`; honor the archived-bundle slug (or raise the scoped TTL for workflow-bound grants).
- ✅ T11. Re-home the landmarks still carrying the category default `scope: [scout]`, which T8 deferred. T8 curated the other two cohorts — the entries stamped with the retired placeholder and the landmines at the five-phase default — and narrowed what a spec write and a security write surface. The landmarks were left because the obvious fix does not work: the path leg fires on WRITING a governed file, and scout writes only `docs/scout/<slug>.md`, which no landmark governs, so re-homing would remove landmark surfacing from scout entirely rather than narrow it. What this needs is the third mechanism T8's spec named as a non-goal — a relevance filter over the workflow's declared write surface — so a scout write surfaces the landmarks for the paths that workflow will touch. Spec AC-009 tagged the deferral `deferred: risk`, and `tests/memory-scope-store-invariants.test.mjs` is the oracle that locks the affected set, so this cannot drift closed unnoticed. That test owns the number; this row deliberately quotes none, because a hand-maintained third copy of a live count is wrong the moment any workflow files a landmark.

## Epic 7 — Living system model  ✅  (memory)

Durable architecture memory: a decision graph that reaches whoever is editing the code, and a constraint
model that can invalidate the reasoning built on top of it. Discovery ran once as an `epic` track and the
sliced spec is archived at `docs/archive/2026-08-04/living-system-model/spec.md`. Slices A–D landed as a `power` batch
(`e7f00de`..`6464a58`), E followed in `4888484`, and F landed in `27c18a6`. All six are built and enabled
in this repository; every feature ships default-off, so consumer installs are unaffected until they opt in.

The epic is closed. Its four child cycles all ran on `power` or `spec-entry` rather than `epic-child`,
because each needed a spec node that `epic-child` does not carry, so no child ever registered itself and
the close fold never fired. Closing it took the standalone `epic_close.mjs` path with `children[]`
reconstructed from the four archived bundles, crediting each slice to the cycle that made it deliver.

- ✅ A. Decision node model. `governs:` path anchors, `rests_on:` constraint keys, `load_bearing:`. Decay becomes supersession-driven: a decision expires by being superseded, not by elapsed time, because an open decision is still in force however old the commit that verified it. Stale decisions went 26 to 0, whole-store stale 173 to 147.
- ✅ B. Constraint model. Eighth canonical category at `.claude/memory/constraints/`, mutable and re-verifiable where a decision is immutable and superseded. A state flip surfaces every decision naming it in `rests_on:` as suspect at session start. Collapsed the canonical category list from nine hardcoded literals to one import; seven of those nine failed silently when a category was added.
- ✅ C. Index and recall layer. Derived index over `by_path` / `by_constraint` / `by_element`, rebuilt on every read rather than cached, and a second surfacing trigger keyed on path that extends `process_lifecycle_guard` rather than adding a 27th hook. A full build over 239 entries measures 17.5 ms, which settled the epic's build-on-demand question; the HEAD-keyed cache it replaced was both slower and wrong on non-git trees.
- ✅ D. Capture leg. A discard ledger persisting a curation decision across the `/memory-sync` reset, so a candidate promoted or discarded once is not re-offered as fresh. Extends the existing dedup lifetime in `memory_stop` rather than adding a second dedup.
- ✅ E. Workspace structural corpus. A durable C4 and module-level diagram set that each cycle contributes to rather than re-deriving, so `scout` reconciles instead of rediscovering. Flagged OVERSIZED at epic triage and still carries the epic's open questions on workspace merge semantics and diagram authority; the third, index rebuild cost, was answered by C. Split before approval.
- ✅ F. Tracking comments. Code annotations naming a decision, constraint or research doc, resolvable by `scout`. Placement is gated on A's `load_bearing:` marker so annotations land where a maintainer would otherwise confidently break something, rather than broadly. Buildable now that A has landed.
## Epic 8 — Codebugger explanation trace  ⬜  (codebugger-explanation-trace)

- ⬜ A. Runtime-witness rule and the mcp-debugger declaration
- ⬜ B. The /codebugger session and the explanation trace
- ⬜ C. The debug track and the docs/debug artifact registration
## Epic 9 — Erp portables  🟡  (erp-portables)

- ✅ A. Article II §4.2-A — read-only advisory subagents (binding-judgment scoping; scout/research gathering delegation)
- ✅ B. branch_guard hook (25→26) — block workflow.json creation on a release branch under github-flow
- ✅ C. Branch-aware gate C — autonomous commit→push→PR on non-protected feature branches; requires_commit_consent conditional node
- ✅ DEF. Build-to-spec doctrine — leanest-safe-track triage + novelty, opt-in derivation-first brainstorm (no read-time default flip), XI.12 decision economy
- ✅ G. Two-sided faithful scope + VI.4 YAGNI floor/ceiling — traceability-review Critical BLOCKER on untagged/YAGNI deferral
- ✅ H. lint_runner/test_runner honor file_globs
- ✅ I. commit-planner + retrospective skills (owner: baseline, generalized; counts 46→48)
- ✅ J1. CI/secrets posture working in this repo — gitleaks pre-commit hard-fail, branch-protection config-as-code (live: repo is public), low-risk auto-merge classifier with NEVER-list
- ✅ J2. Ship CI posture to consumers behind an opt-out — obj/template artifacts + project.json knob; init-project/upgrade-project tailor per install
- ⬜ K. Read-before-write state discipline — harness preflight reads state files once; state-write discipline text mandates Read before Write/Edit on existing files
- ⬜ L1. sprint-planner skill + generic graph engine — source-adaptive sprint selection (tasks file / epic slices with optional deps[] / backlog), graph.mjs port with buckets-from-input, graceful status-only degradation, proposal-only output
- ⬜ L2. power batch-sprint track + skill — amortized mechanical phases over tickets[], per-ticket security iteration, commit split via commit-split.mjs with closure last, velocity.power_mode.enabled opt-in (depends on L1)
## Epic 10 — Living system model  ✅  (living-system-model)

- ✅ A. Decision node model
- ✅ B. Constraint model
- ✅ C. Index and recall layer
- ✅ D. Capture leg
- ✅ E. Structural corpus
- ✅ F. Tracking comments
## Epic 11 — Mvp sprint parallel cycles  🟡  (mvp-sprint-parallel-cycles)

- ✅ A. Sprint completeness oracle
- ✅ B. Baseline-owned MCP coordination channel server
- ✅ C. Sandboxed sprint mode: lead-spawned bounded workers on the channel + RALPH yield
- 🟡 D. Merge + integrate + single gate-C on the sprint result
- ✅ E. Bounded charter for the sprint sandbox — SUPERSEDED, not built: Article X absorbed this slot per seed.md §4.2
## Epic 12 — System spec delta  ✅  (system-spec-delta)

- ✅ A. C2-1 — `## System delta` becomes a required spec section, with a spec-lint row validator
- ✅ B. C2-3 — diagram shard writer (writeDiagramShard) plus the /system-reconcile report-first skill
- ✅ C. C2-2 — archive verifies the declared delta against the landed diff before applying anything (depends on A and B)
- ✅ D. C2-4 — backfill the @kind witness annotation across every shard in docs/system/diagrams/ (depends on B)
- ✅ E. C2-5 — research retrieves structurally over the corpus via source_spec, ranked beside term overlap
- ✅ F. C2-6 — constitutional amendment: seed.md §4.8/§9/§12, CLAUDE.md Article IX clause 10, byte-equal mirrors, under the 38,800-char budget
