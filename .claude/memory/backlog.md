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
- caveat: Full vision + audit captured at `docs/vision/baseline-v1-thought-compiler.md` (currently UNTRACKED — not in any commit yet; a future v1-design workflow should commit it). This is the big next epoch, NOT a quickfix. Sequence per the doc: (1) amend seed.md §Article II then CLAUDE.md to permit bounded agent-team execution under an orchestrator (workers decide inside an orchestrator-owned frame; scope/write_set escalation bounces up); (2) plan-as-durable-diffable-state schema (mirror workflow.json discipline); (3) maker/checker RALPH protocol with checkers BOUND TO MECHANICAL ORACLES (the load-bearing constraint — two LLMs alone agree on hallucinations); (4) the "safe vs ask-a-human" gate taxonomy BEFORE any autonomy; (5) AI-native debugging skill (explanation-trace as the reviewable object). Each of 1–5 deserves its own intake→spec→approve cycle. v2 (signal-driven AI-native OS: Sentry/GA4/CRM/CI connectors → diagnose → fix → deploy) rides on a trusted v1. Open questions (maker/checker deadlock cap, where reactivity lives, the merge/synthesis oracle, auto-deploy rollback + kill switch) are listed in the doc.

---

## destructive-guard-and-grant-sweep-residual-hardening-7f2c

> verbatim (assistant-deferral, 2026-05-31, from docs/archive/2026-05-30/infra-hardening/security.md Resolution):
> Deferred (tracked in backlog / seed.md §16 guard-hardening sweep — deny-leaning or out of a regex guard's reach): MEDIUM `$VAR`-indirected consent paths (needs shell variable resolution); LOW symmetric false-positive in `destructive_cmd_guard` (whole-command match, not segment-scoped) — fold into the same segment-aware pass later; LOW `memory_session_start` grant-marker sweep symlink/TOCTOU — own-state, local-only.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-31
- raised-in-context: infra-hardening security review (residuals after the HIGH + actionable MEDIUM were fixed in-workflow)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-31
- caveat: all three are deny-leaning or local-only (not remotely exploitable). The destructive false-positive could reuse the new `executedFragments`/segment-aware classifier from `common.mjs` to scope the consent-path-write check to the executed segment. Pairs with the broader seed.md §16 guard-hardening sweep (canonical_rel coverage, fail-closed on malformed payload, symlink defense across all guards).

## improved-backlog-item-detection-046c

> verbatim (user, 2026-05-17):
> improved backlog item detection (this I am saying without testing anything but given that last memory flush deleted it means backlog item extraction can be improved)

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: post-backlog-memory-bucket review (no active workflow)
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: Direct-write to `backlog.md` because `memory_stop.mjs` intent-detection didn't fire on this item's prose phrasing — which is itself the evidence the user cites. The intent regex set in `memory_stop.mjs` (anchored line-start patterns like `TODO:`, `next we (should|need to|must)`, `let's also`, `we should also`, `backlog this`, `after this (lands|ships)`) misses descriptive numbered-list items like "1. improved backlog item detection". Scope of follow-up: widen the trigger set toward higher recall while preserving the precision contract from the backlog-memory-bucket intake ("only obvious future-intent phrasings should match; mid-sentence accidental matches should not"); add a test corpus of true-positive sentences from real conversations; consider a second pass at flush-time that lets the curator manually promote anything the hook missed.

## document-phase-public-site-update-trigger-5e07

> assistant-deferral (claude, 2026-05-18):
> The /document phase needs a better trigger for "behavior change → public docs site update" — I treated it as internal-only when site-src/ described the workflow.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-18
- raised-in-context: workflow-loop-closing-hygiene end-of-workflow lessons (commit bfad579)
- estimated-effort: medium
- verified-at: bfad579
- last-touched: 2026-05-18
- caveat: The `/document` skill's Step 2 survey classifies touched files into documentation / technical-tutorials / prose delegate buckets. It does NOT classify by "the change modifies behavior that an existing public-docs page describes." During workflow-loop-closing-hygiene's first `/document` pass, I anchored on "no site-src/ file is in my write_set" → "no site work needed" — which got the direction backwards. The site DESCRIBES behavior; when behavior changes, the description needs updating even when no site-src/ file initially appears in the diff. Cure surfaces: (i) extend `/document` Step 2 with a "site-describes-this-behavior" check that greps the public-docs surface (site-src/**.njk) for references to skill names + workflow-phase names touched by the diff and routes any matches through the `documentation` delegate; (ii) require the spec's Archive plan section to enumerate any public-docs pages that describe behavior the spec changes, surfacing the requirement at /spec time rather than at /document time. Either path requires the trigger to be REFLECTIVE (the diff's behavior change implies a docs surface that may not be in the diff yet), not just file-presence-driven. See `workflow-loop-closing-hygiene` archive bundle's session log for the live miss-and-fix-up cycle.

## auto-summarize-spec-and-surface-open-questions-at-gate-4ab5

> verbatim (user, 2026-05-20):
> can you summarize the spec and present me all the open questions that needs my attention (add this for backlog too, this would be nice feature improvement)

- source: user-instruction
- status: open
- raised-on: 2026-05-20
- raised-in-context: workflow-extension-via-workflows-json /approve-spec consent gate
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-20
- caveat: When the harness yields at `/approve-spec`, the reviewer often has to manually open three artifacts (intake, research, spec) to find every open question — and across them, the same question can recur under different framings while the spec's own §Open questions list omits items the upstream artifacts already declared. The user surfaced this gap at the workflow-extension-via-workflows-json approve-gate. Proposed automation: a small helper invoked at gate-A yield that (i) reads the slug's intake/research/spec/BRD if present, (ii) extracts every `## Open questions` entry (and equivalents like research's "Open questions for /spec to resolve"), (iii) dedupes by semantic intent, (iv) classifies each as `must-decide-before-approval` (touches load-bearing design choice surfaced in the recommendation pivot or in the spec's §Open questions) vs `settled-in-spec` (spec already picked a default but flagged as decidable) vs `defer-to-tdd` (resolvable at impl time), and (v) emits a tight summary + bucketed question list to the harness yield message. Probably belongs in the harness skill body (an extra step before emitting the yield terminal message when `reason: "yielded at /approve-spec"`) or as a new `spec-summary` skill the harness invokes inline. Tradeoff: more harness-body logic vs cleaner separation in a dedicated skill. Test corpus: any past workflow's approve-gate transcript; verify the extracted question set matches what a human reviewer would surface.

## llm-assisted-memory-capture-routing-cf4a

> verbatim (user, 2026-05-30):
> actually this means we need to fix our memory feature; what's happening right now is, our _pending and _resume collects notes every turn (or every n turns) but a /memory-flush call cleans everything because it is pure logic and not LLM assisted feature.. in ideal case, with LLM assistance, the system can recognize what piece of memory is important and can be kept or moved to (say open question or backlog) automatically.. so, let us work on this feature in next session (add to backlog)

- source: user-instruction
- status: open
- raised-on: 2026-05-30
- raised-in-context: (no active workflow) — surfaced right after the CLAUDE.md 40k-cap split; the user observed that prior-session work (brainstorm/codesign) was only recoverable via the ephemeral `_resume.md` snapshot, not durable curated memory
- estimated-effort: large
- verified-at: HEAD
- last-touched: 2026-05-30
- caveat: Verbatim is canonical (per `.claude/memory/README.md → Source provenance`); this interpretation refines, not overrides. Factual nuance to carry into design: `/memory-flush` is ALREADY LLM-assisted — it runs in main context with the model as curator (Step 2 promote/discard/defer). The genuinely PURE-LOGIC pieces the user is reacting to are (a) `.claude/hooks/lib/memory_stop.mjs` intent/landmark extraction — anchored, line-start regex (`INTENT_TRIGGERS`) that is precision-tuned to NOT fire mid-sentence, and (b) `.claude/skills/memory-flush/sweep.mjs` closure/stale mechanics. Live evidence captured this session: this very instruction would have been DROPPED by the auto-extractor — "...we need to fix..." is mid-sentence (line starts "actually this means") and "let us work on... (add to backlog)" matches none of the triggers (`let's also`, `backlog this`), so `memory_stop` emitted no candidate and the item only survived because it was hand-promoted here. Improvement scope to explore next session: (1) LLM-assisted EXTRACTION at capture time (replace/augment the anchored regex with a model pass that recognizes salient intent regardless of sentence position) and routing to the right canonical bucket (landmark / decision / open-question / backlog) automatically; (2) make `_resume.md` (or a sibling) carry a durable, curated "what we were working on + why" thread rather than a per-turn-overwritten snapshot, so cross-session continuity survives a `/clear`; (3) keep the human-in-the-loop curation guarantee (Article IX.3: promotion to canonical only via `/memory-flush`) — any auto-routing should still stage to `_pending` for review, not write canonical directly. Cross-refs: the auto-extraction regex misses are a recurring theme (see also `stale-sh-refs-in-tests-after-mjs-port` for a different residual-debt pattern). Companion entry: `shelve-conversation-on-context-switch-with-verbatim-cues-b7e2` extends point (2) into a mid-session *transition* event (shelving on topic-switch) and hardens "durable" into "committed + survives `/memory-flush`".

## document-public-site-feature-framing-not-behavior-7b3e

> verbatim (user, 2026-05-30):
> the current document only describes technical aspect but on public website we need to describe features not just the behavior. for now we can continue but we will later fix our document skill

- source: user-feedback
- status: open
- raised-on: 2026-05-30
- raised-in-context: conversation-thread-shelving /document phase (site-src/memory.njk _thread.md update)
- estimated-effort: medium
- verified-at: ab412d1
- last-touched: 2026-05-30
- caveat: The /document skill routes site-src/** prose through the reference-documentation register, so the memory.njk _thread.md row I wrote describes WHAT it does + HOW shelve/resume work, but not the user-facing FEATURE value ("never lose your train of thought across a pivot, /clear, or flush"). Improvement: /document Step 2 should detect site-src/** (public marketing/docs) targets and route value/feature framing through the persuasive register (copywriting) distinct from the behavior table — describe the feature, not just the mechanism. Verbatim is canonical.

## thread-trail-unbounded-growth-bounding-rolloff-4d8a

> verbatim (claude, 2026-05-30):
> _thread.md is append-only and excluded from /memory-flush reset (durable by design) -> unbounded on-disk growth (CWE-400, low impact); follow-up: size-cap + roll-off of oldest sections (or a cold _thread.archive.md).

- source: assistant-deferral
- status: open
- raised-on: 2026-05-30
- raised-in-context: conversation-thread-shelving /security review (LOW finding 3) + intake OQ-1 (bounding/lifecycle)
- estimated-effort: medium
- verified-at: ab412d1
- last-touched: 2026-05-30
- caveat: SessionStart injection is bounded (most-recent section only, ~10KB envelope — AC-009) and per-entry capture is capped (MAX_CUES/MAX_FILES/MAX_OPEN_QUESTIONS), so context/runtime cost is bounded; only on-disk size grows without limit. Resolves intake OQ-1. Follow-up: size-cap + roll-off of oldest sections, or move cold sections to _thread.archive.md.
