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

## changelog-unreleased-rerelease-risk-after-union-merge-3a5e

> verbatim (assistant-deferral, 2026-06-01, WF-4 union-merge decision):
> The WF-4 one-time CHANGELOG.md cleanup unioned ~138 lines of detailed keepachangelog notes for ALREADY-RELEASED versions (0.4.0–0.12.0) into the single `## [Unreleased]` section (the user chose union to preserve the prose rather than drop it). Because `@semantic-release/changelog` moves the `[Unreleased]` body into a new version block at release time, the next version bump will re-emit all of that already-released detail as a bogus, bloated new version block.

- source: assistant-deferral
- status: open
- raised-on: 2026-06-01
- raised-in-context: changelog-actuator-staged-diff (WF-4) — union-merge scope decision (user picked "union" over "drop orphaned detail")
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-06-01
- caveat: Before the next `semantic-release` run, prune `CHANGELOG.md`'s `## [Unreleased]` down to genuinely-unreleased work only (the current infra-hardening + brainstorm/thread + 40k-cap + this WF-4 entries), OR redistribute the orphaned detail into the version blocks it describes. The terse `# [0.x]` version blocks already record those releases, and git history preserves the detailed prose, so the safe move at release time is to drop the already-released detail from `[Unreleased]`. Pairs with the source-of-truth fix tracked in [[changelog-actuator-reads-head-not-staged-4dc0]] (WF-4b) — once the actuator stops re-listing committed work, [Unreleased] hygiene is easier to maintain.

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

## commit-consent-ttl-too-tight-for-humanizer-flow-8917

> assistant-deferral (claude, 2026-05-18):
> The 300s commit_consent TTL is tight for commits that need humanizer + an explanation hop in between. The cure is to not add a stall ("want me to go ahead?") between grant-commit and git commit when no new question is actually pending.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-18
- raised-in-context: workflow-loop-closing-hygiene end-of-workflow lessons (commit bfad579 required a /grant-commit re-grant after the first token expired)
- estimated-effort: small
- verified-at: bfad579
- last-touched: 2026-05-18
- caveat: `project.json → consent.commit_ttl_seconds` defaults to 300. During this workflow's `/commit` step, the elapsed time from /grant-commit consent to actual git commit was 544 seconds — the message-drafting, humanizer pass, and a redundant "want me to go ahead?" stall ate the window. Two non-exclusive cures: (i) behavioral — don't insert post-grant stalls when there is no actual decision pending; the user's /grant-commit already authorized the commit. Add this as `/commit` SOP guidance: between Step 4 (humanizer) and Step 5 (git commit), do NOT emit a clarifying question to the user — humanizer's output is the final body and the commit fires immediately. (ii) configuration — raise `consent.commit_ttl_seconds` default to 600 to absorb humanizer latency on slower runs, or have `/commit` check the token's age before Step 4 and re-grant if `< 60s` remaining. Behavioral cure is YAGNI-aligned (no config change); configuration cure is more robust but adds knobs.

## triage-skill-md-still-duplicates-workflows-jsonl-canonical-templates-c8f4

> verbatim (user, 2026-05-21):
> shall we perform an drift analysis; my understanding is that triage still has hardocoded tracks

- source: user-instruction
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json drift analysis Round 4 (post-document, pre-archive)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: After the post-§18 architecture landed, `.claude/skills/triage/SKILL.md` lines 57-71 still carry the four canonical track templates (chore / tdd-quickfix / spec-entry / intake-full) verbatim under a "Reference: canonical track shapes (mirrored in workflows.jsonl)" subheading. The runtime path (seed-tasklist.mjs + materializer) reads `.claude/workflows.jsonl`, NOT these SKILL.md templates — so behavior is correct today. But the source of truth is split: workflows.jsonl is authoritative; the SKILL.md text is a duplicate description. A downstream user editing workflows.jsonl to add a new track or modify ordering will NOT see that reflected in the SKILL.md body. The templates were RESTORED (not kept by design) during /integrate because the N-file enumerating tests in `tests/memory-flush-phase.test.mjs:235-272` parameterize over 8 files including triage SKILL.md and assert each mentions "memory-flush" with archive before + commit after — removing the templates broke 2 tests; restoring them satisfied the assertions. Remediation: (1) rewrite memory-flush-phase.test.mjs to parse `.claude/workflows.jsonl` directly for the canonical tracks (scenario territory, can't be done inside an /implement pass); (2) once those tests pass off workflows.jsonl, remove the "Reference: canonical track shapes" subsection from triage SKILL.md; (3) re-run byte-equivalent + mirror checks. Both edits are ~10 lines total. Until done, the duplication is latent drift; the byte-equivalent migration test catches it as long as someone keeps both in sync.

## workflow-migrator-write-not-atomic-power-loss-corruption-3e91

> assistant-deferral (claude, 2026-05-21):
> Workflow.json migrator at src/cli/workflow-migrator.js:38 writes via writeFile — non-atomic. A process crash, kill signal, or power loss between open and fsync leaves a partially-written workflow.json on disk. The next harness invocation reads a corrupt or truncated file and aborts.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json /security review (LOW finding 1)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: OWASP A08 / CWE-362 (race condition). Mitigation: use the write-to-temp-then-rename pattern. POSIX rename is atomic on the same filesystem. Code shape: `await writeFile(filePath + '.tmp', body); await rename(filePath + '.tmp', filePath);`. ~3-line change in workflow-migrator.js. Defers risk from "partial corruption" to "rename interrupt" which is recoverable (.tmp file left behind; harness can detect on next preflight and clean). No data loss possible in either case (user can re-run /triage to restart the workflow). Non-blocking; advisory per the /security skill's MEDIUM/LOW → continue rule.

## triage-helper-slug-interpolation-into-bash-subprocess-a720

> assistant-deferral (claude, 2026-05-21):
> Triage SKILL.md instructs Claude to run `node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug>` via the Bash tool. <slug> and <track_id> are substituted by Claude at invocation time. If Claude generates a slug containing shell metacharacters (`;`, `&&`, backticks), the Bash invocation could execute attacker-controlled commands.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json /security review (LOW finding 2)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: OWASP A03 / CWE-78 (OS command injection). Theoretical: the triage SOP already constrains slug to canonical-kebab via `lib/common.sh → canonical_slug` (strip directory prefix + trailing `.md`); triage classifies and confirms before substitution. Realized exploit requires multiple chained social-engineering steps. Defense in depth options: (a) quote the args in the documented invocation pattern (`node .claude/skills/triage/seed-tasklist.mjs "$track_id" "$slug"`); (b) have triage instruct Claude to assert `[[ "$slug" =~ ^[a-z][a-z0-9-]*$ ]]` before invoking the helper. Either is ~1 SOP line. Non-blocking; advisory.

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

## canonical-track-count-duplicated-across-10-surfaces-9a2b

> verbatim (user, 2026-05-28):
> we missed updating on homepage. proof that our data is still duplicated across different pages

- source: user-instruction
- status: open
- raised-on: 2026-05-28
- raised-in-context: introduce-freeform-track chore — homepage meta-strip stat rendered the old "4 Tracks" because `site-src/_data/baseline.json → tracks.canonical` wasn't bumped alongside the prose mentions
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-28
- caveat: The canonical track count lives in 10 places that must stay in sync: `.claude/workflows.jsonl` (live data; the actual track records), `site-src/_data/baseline.json → tracks.canonical` (homepage meta-strip), and 8 hardcoded prose mentions across `README.md` (×2: line 44 + table row), `CLAUDE.md` (Article IV via prose-mention indirectly — no explicit count line today), `src/CLAUDE.template.md` (mirror), `docs/init/seed.md` §18.1 (×2: 7-track set + canonical-four wording), `src/seed.template.md` (mirror), `.claude/skills/triage/SKILL.md` (canonical-track-shape reference paragraph), `site-src/workflows.njk` (frontmatter description + lead + body listing + sub-track count line + "as the canonical N" FAQ), and `site-src/index.njk` (`<h3>`, body, `<title>` SVG label, figcaption "N other tracks", FAQ "N canonical tracks"). Every change adds churn across all 10. The fix: derive the count from `.claude/workflows.jsonl` at build time and surface as a template variable. `site-src/_data/baseline.json` is already eleventy-data; an adjacent `tracks.js` (or extending `baseline.js`) could count selectable Tracks in workflows.jsonl and expose `baseline.tracks.canonical` to the site. Prose mentions that say "five canonical tracks" remain hardcoded — those need a different remedy (templated-prose injection, or an audit check that grep-counts vs the JSON source). At minimum, `baseline.json → tracks.canonical` should be the single template-source, and an audit check should fail when the JSON value disagrees with the actual selectable-track count in workflows.jsonl.

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

## thread-store-non-atomic-state-writes-9c12

> verbatim (claude, 2026-05-30):
> thread_store/resume_transform write the cursor/candidate/cache JSON via direct writeFileSync (not write-then-rename); CWE-362, self-healing (null -> fallback) so LOW; optional hardening: write-to-temp-then-rename for the JSON sidecars matching common.mjs writeMarkerAtomic.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-30
- raised-in-context: conversation-thread-shelving /security review (LOW finding 2)
- estimated-effort: small
- verified-at: ab412d1
- last-touched: 2026-05-30
- caveat: thread_store.writeJson (cursor/candidate) + resume_transform.writeCache use direct writeFileSync; appendEntry uses appendFileSync. A crash mid-write can truncate a sidecar, but readJson/readCache catch parse failure and callers fall back gracefully (whole-transcript fallback / recompute / parseSections skips a partial trailing block) — no loss of prior entries. Cross-ref backlog workflow-migrator-write-not-atomic (higher impact there). Optional defense-in-depth.

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
