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

## shelve-capture-grabs-skill-sop-boilerplate-not-decisions-91a3

> verbatim (user, 2026-06-01):
> the cue extractor shelve_capture.mjs grabs skill-SOP boilerplate as "cues" instead of real decision text ... let us add both as 1 backlog item

- source: user-instruction
- status: open
- raised-on: 2026-06-01
- raised-in-context: post-mortem of the thread-trail-rolloff-cap (4d8a) workflow; the ONE existing shelf entry (2026-05-31) was dominated by injected SKILL.md bodies captured as cues
- estimated-effort: small (Tier 1) + large/deferred (Tier 2)
- verified-at: 464da06
- last-touched: 2026-06-01
- caveat: `.claude/hooks/lib/shelve_capture.mjs → extract` (lines ~40-50) pushes EVERY `user`-role event's text as a verbatim cue with NO noise filter, so Skill-launch SKILL.md bodies (which arrive as user-role text, prefixed `Base directory for this skill:`) plus `<command-name>` / `<system-reminder>` / `<local-command-` wrappers get captured as "cues". The fix is two tiers, tracked here as ONE item per user request. **Tier 1 (small, do first, `tdd-quickfix`):** add an `isBoilerplate(text)` guard in `extract`'s user-branch, mirroring `memory_stop.mjs`'s existing `NOISE_PREFIXES`/`filterNoise` (`<system-reminder>`, `<command-name>`, `<local-command-`) plus a `^Base directory for this skill:` skill-SOP marker; optional DRY win = lift the shared noise list into `.claude/hooks/lib/common.mjs` so `memory_stop`, `resume_writer`, and `shelve_capture` share one source (the thread_store landmark caveat already says "Noise filters must mirror resume_writer.mjs"). Deterministic; ~20-40 lines + a fixture test. **Tier 2 (large, fold into [[llm-assisted-memory-capture-routing-cf4a]]):** *weight* actual user/assistant decision text vs chatter — semantic, not prefix-matchable; an LLM pass at capture time, which IS the cf4a item. Do Tier 1 standalone; do NOT attempt Tier 2 with regex.

## reduce-full-test-suite-runtime-toward-one-minute-652c

> verbatim (user, 2026-06-02):
> let us add a backlog item to reduce this testing time to ~1 minutes (or whatever least is possible)

- source: user-instruction
- status: open
- raised-on: 2026-06-02
- raised-in-context: right after Part A (`faster-test-suite-shared-build-plantuml-gate`, commit 2afb07c) cut the serial suite ~644s→~459s; the user wants a deeper target (~1 min) and Part B (plantuml-guard-opt-in-strict) was in flight
- estimated-effort: medium-large
- verified-at: 2afb07c
- last-touched: 2026-06-02
- caveat: Part A already (a) gated the 6 JVM-spawning PlantUML tests behind `PLANTUML_TESTS=1` and (b) shared the per-test template build inside `skill-ownership.test.mjs` / `manifest.test.mjs`. To go from ~459s toward ~60s the dominant levers, in priority order: **(1) Run the suite in PARALLEL.** It is pinned to `--test-concurrency=1` because some build-exercising tests mutate the LIVE `obj/template` (`tests/build-template.test.mjs` rm -rf's + rebuilds it; others READ it) — a data race under concurrency. Route EVERY build/manifest/audit test through an isolated tmpdir (the `tests/helpers/clone-and-build.mjs` pattern) so NOTHING touches live `obj/template`, then drop the concurrency pin. Wall-clock then approaches max-single-test (~15-30s) instead of sum-of-all. This is the single biggest win. **(2) Build the template ONCE per suite, not per file.** ~10 test cases each run a full `scripts/build-template.sh` (rsync + sha256 of ~260 files + audit, ~20-30s each). node:test isolates files in separate processes, so a process-level cache won't cross files — instead build one pristine tree in a global setup (or a make-style prebuilt fixture under a known tmp path) and have all read-only build/manifest tests point at it; mutating drift tests `cp -a` from it (Part A already does this within a file). **(3) Speed up the build itself:** `scripts/build-manifest.mjs:138-150` reads+sha256s ~260 files per build (~8-12s); `build-template.sh` Stage 4 then re-hashes them again in `audit.mjs:295` — skip the redundant Stage-4 re-hash after a fresh build (the DEFERRED "audit `--skip-hash-check`" idea, ~16-24s total across tests). **(4)** Env-gate or trim the npm-pack/install `publish-check`/`smoke-tarball` tests (~1.5 min) behind a flag like the PlantUML gate, since they need network/npm and rarely change. Measured baseline + per-test breakdown captured during the Part A investigation (top offenders: spec-lint check_design_calls 59s [now gated], build-audit-gate 35s, manifest-tier 28s, audit-exits-0 27s, manifest-v2 25s, skill-ownership drift cluster). Net: parallelization (1) + single-build (2) should plausibly reach 1-2 min; (3)+(4) trim further. Risk: (1) requires auditing every test for hidden shared-state writes (live `obj/template`, `.claude/state/`, `.claude/memory/`) before lifting the concurrency pin. Cross-ref: the live-`obj/template` race is now documented as the landmine `live-objtemplate-rebuild-races-parallel-test-readers` (landmines.md).

## git-workflow-model-declared-detected-guard-enforced-topology-e579

> verbatim (user, 2026-06-02):
> I need answers; why did we create a new branch and pushed the code there? We didn't follow this process for last ~93 commits? ... this need more than convention. git management is a giant of its own. let us brainstorm on this ... park it in backlog and we'll pick it up later

- source: user-instruction
- status: open
- raised-on: 2026-06-02
- raised-in-context: post-commit review of the `changelog-generator-routing` workflow (commit 6e11f2f). I created a feature branch `feat/whatsnew-generator-routing` and committed there, contrary to this repo's established practice (93 linear commits direct-to-main, zero merge commits; semantic-release releases on push to main/next). Nothing was pushed; I fast-forwarded main to the commit and deleted the stray branch. Root cause: the baseline models git SAFETY (consent gates, forbidden-flag guards, worktree isolation) but not git STRATEGY, so a generic "branch off the default branch first" instinct won by default with nothing project-specific to override it. `git.protected_branches: null` only governs consent, not topology — I misread it as "must branch".
- estimated-effort: medium (intake-full: project.json schema + mirror, init-project detection, git_commit_guard extension, Article VII clause, commit SOP, seed.md)
- verified-at: 6e11f2f
- last-touched: 2026-06-02
- caveat: Converged brainstorm design (scope DELIBERATELY bounded to "declare + enforce the branch model"; full push/PR/merge/release lifecycle is OUT of scope for v1). **Knob:** `project.json -> git.workflow_model` enum `direct-to-main | github-flow | gitflow | trunk | ask`; absent/ambiguous resolves to `ask`. **Models to implement now (YAGNI):** `direct-to-main` + `github-flow` + `ask`; `gitflow`/`trunk` are reserved enum values that resolve to `ask` until a consumer needs them. **Detection at /init-project (best-effort, detect + safe default):** infer from release-CI trigger (`push: [main,next]` + semantic-release -> direct-to-main), `gh api` branch-protection requiring PRs -> github-flow, `develop`+`release/*` branches -> gitflow, linear vs merge history; confirm via AskUserQuestion; ANY ambiguity or unreachable `gh` -> `ask` (never guess). **Precedence (the actual root-cause fix):** an Article VII clause stating the declared model OVERRIDES Claude's generic git instincts + the harness default branching behavior; Claude SHALL NOT create/switch/delete branches except as the model prescribes; `ask` -> yield the branch/push decision to the user, never improvise. **Enforcement = HARD structural guard** (advisory-only is what failed): EXTEND `git_commit_guard` (do NOT add a 23rd hook — keep the count at 22; the guard already intercepts `git commit` at the Bash boundary and reads `project.json -> git`) to block a commit whose current branch contradicts the model, with a remediation message (direct-to-main + on a feature branch -> "commit belongs on main: git checkout main && git merge --ff-only <branch>"; github-flow + on main -> "create a feature branch first"). **Per-model commit behavior:** direct-to-main = must be on the release branch, refuse feature branches; github-flow = must be on a feature branch (branch discipline ONLY — does NOT create the PR; push/PR/merge stay out-of-band per scope); ask = guard PASSES (nothing declared to enforce) and the commit/harness SOP yields the branch question. **Spec watch-items:** (1) `ask` passes the guard, the SOP asks — keep block-vs-yield separate. (2) SWARM WORKTREE EDGE: `/swarm-dispatch` commits inside git worktrees then merges back; a naive direct-to-main guard would false-block worktree commits — needs a worktree-aware carve-out (enforce topology only on the primary working tree at `/commit`, not on dispatch worktrees). (3) detection is best-effort (gh needs auth+network; headless/CI -> ask). (4) this repo migrates to `git.workflow_model: "direct-to-main"` and must verify BOTH normal `/commit` and swarm dispatch still pass under the new guard. (5) composes with existing branch-aware consent (`protected_branches`/`branch_pattern`) — topology and consent are separate concerns on the same `git commit` boundary. This is itself an `intake-full` workflow + constitutional amendment when picked up.

## code-browser-skill-dormant-only-scout-conditional-ref-9f3c

> verbatim (user, 2026-06-02):
> Also, code-browser is added skill but is never used/loaded. We need to handle that too (later)

- source: user-instruction
- status: open
- raised-on: 2026-06-02
- raised-in-context: during the `state-write-discipline` SOP-hardening chore. The user believed code-browser is never loaded; verification corrected this slightly — it IS wired, but only via ONE conditional reference: `scout/SKILL.md:28` invokes `Skill(code-browser)` for navigation questions ("where does data on page X come from?"). It is also catalogued in `docs/init/seed.md` §4.3 and `.claude/CONSTITUTION.md` Appendix B. No command, no other skill, no workflow node invokes it. In THIS baseline repo (a CLI/governance codebase, not a page→component→API frontend app) scout rarely generates navigation questions, so the skill is effectively dormant — present and counted (1 of 40 skills) but practically never exercised.
- estimated-effort: small-medium (decision + light edits)
- verified-at: ba5d91b
- last-touched: 2026-06-02
- caveat: Decision to make when picked up: (a) KEEP as-is — it ships for CONSUMER projects that ARE frontend apps (the baseline is a template; dormancy here ≠ dormancy downstream), and document that explicitly; OR (b) broaden its wiring (e.g., let `code-structure`/`scout` reach for it more readily, or surface it as user-invocable); OR (c) remove it and drop the skill count 40→39 (touches seed.md §4.3 count claims, CONSTITUTION Appendix B, audit-baseline skill-count assertions, manifest owners.skills). Option (a) is most likely correct given the template-vs-consumer distinction — the real action may just be a one-line note in seed.md/Appendix B that code-browser is a consumer-facing navigation skill, dormant in this repo by codebase type. Confirm intent before any removal: dropping a skill is a governance-count change cascading through CLAUDE.md/seed.md/README/audit. Cross-ref: `scout/SKILL.md:28` is the sole live invocation site.

## drift-check-diffs-committed-history-noop-pre-commit-d1f7

> verbatim (assistant-deferral, 2026-06-02):
> drift_check.mjs diffs mergeBase..HEAD (committed history), so it is a no-op during the pre-commit /tdd phase

- source: assistant-deferral
- status: open
- raised-on: 2026-06-02
- raised-in-context: the `guard-commit-msg-falsepos` workflow. The harness inlines `drift_check.mjs --slug <slug>` at the drift-check-tick during `/tdd`, before `/commit`. `loadDiff` (`.claude/skills/tdd/drift_check.mjs:46`) runs `git diff ${mergeBase}..HEAD` — COMMITTED history only. Since workflow code is uncommitted at the tdd phase (commit is the last phase), the diff is empty and EVERY AC reports `unresolved` ("no diff added-line references this item"). This workflow's drift-check-tick flagged all 8 ACs unresolved purely from this; passing `--diff <working-tree-diff>` showed the true 7/8.
- estimated-effort: small
- verified-at: 0a70375
- last-touched: 2026-06-02
- caveat: Fix options: (a) `loadDiff` should default to a WORKING-TREE diff that includes uncommitted + intent-to-add untracked files (e.g. `git diff HEAD` plus `git diff` for staged, or `git add -N`-style inclusion) rather than `mergeBase..HEAD`; (b) OR the harness drift-check-tick should generate the working-tree diff and pass it via `--diff`. Secondary, inherent limitation surfaced same run: a "regression meta-AC" like AC-008 ("existing suites still pass") is NEVER diff-line-traceable — it's defended by running the suite, not by an added line; drift_check will always report such ACs unresolved. Consider either (c) a spec convention that regression/no-op ACs are tagged so drift_check skips them, or (d) guidance that such ACs don't belong in the AC table. Cross-ref: `.claude/skills/tdd/drift_check.mjs:39-47` (loadDiff), `:89-97` (scoreAgainstDiff).
