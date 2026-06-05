# Claude Code Baseline — Constitution Annex

This file is the **read-on-demand companion** to `CLAUDE.md`. `CLAUDE.md` is the binding in-session constitution and is capped at 40,000 characters (Article I.6); to hold that cap it carries binding rules only. This annex holds everything that is *explanatory rather than binding*: amendment history, enforcement-mechanism narration, and the reference appendices.

Nothing in this annex overrides `CLAUDE.md`. Where this annex and `CLAUDE.md` appear to conflict, **`CLAUDE.md` governs** (and behind it, `docs/init/seed.md` per Article I.4). Read this file when you need the *why* or the *how* behind a rule whose *what* lives in the constitution.

---

## 1 — Amendment history

### Post-§18 amendment (2026-05-21) — workflow tracks

Workflow track definitions live in `.claude/workflows.jsonl` per `docs/init/seed.md §18`. The phase-ordering rules and entry-point classifications in Article IV remain binding; every Track declared in `workflows.jsonl` SHALL satisfy them plus the additional invariants in seed.md §18.3 (I1..I11). `/triage` reads `workflows.jsonl`, validates each Track against §18, classifies the user's request via LLM reasoning over `name + description + selector_hints`, confirms via `AskUserQuestion`, and materializes the chosen Track's DAG into the TaskList (via `src/cli/track-tasklist-materializer.js`). The 4 canonical tracks shipped in the pristine template are byte-equivalent to Article IV's hardcoded templates per spec AC-016. The harness migrates pre-§18 `workflow.json` files (carrying `entry_phase` + no `track_id`) one-shot at preflight via `src/cli/workflow-migrator.js`. `/init-project doctor` (sub-command) detects schema / invariant / mirror drift and offers interactive fixes.

### X.1 — copy-register scoping (ongoing)

Article X.1 scopes the `impeccable` "Shared design laws" bans to user-facing copy only. Future "impeccable says X, but we ship Y on purpose" decisions get a row in the Article X.1 scope table without re-amending the constitution. Examples already in flight: the meta-strip on the landing (qualified in PRODUCT.md anti-references as "structural counts naming load-bearing components"), and the em-dash scoping itself. New rows SHALL cite the impeccable rule being scoped, the scope decision, and a one-line rationale.

### §II.A — bounded maker/checker charter (2026-06-06, `-c732`)

`seed.md §4.2` gains `§II.A`, a bounded carve-out from Article II's "subagents only execute pre-decided recipes" rule: ONE governed maker + ONE oracle-bound checker MAY run on Claude Code's dynamic Workflow runtime, under the live PreToolUse hooks, gated by an evidence-keyed graduation criterion. `CLAUDE.md` Article II carries only a terse binding pointer (byte budget); the seven clauses live in `seed.md §4.2`; this section holds the narrative. The amendment absorbs the previously-separate `-9360` "full charter" backlog item; `-9360` is rescoped to the graduation target (the future permanent Article II rewrite that lifts the one-maker/one-checker cap to multi-agent). The full corroboration and graduation rationale are in §2 below.

### Article X relocation — annex §5 detail tables (2026-06-05, `-b4d1`)

To hold the 40,000-char cap with comfortable headroom, the elaborative rule tables of Article X.1–X.4 were relocated from `CLAUDE.md` into annex **§5** (this file). `CLAUDE.md` Article X now carries each amendment's terse binding clause plus a pointer to its `§5.x` detail; Article X.5 (navigation routing) stays in full in the constitution. No rule lost binding force — the relocation moved elaboration only, leaving every SHALL/SHALL-NOT clause, enforcement-hook citation, and `REQUIRED_BINDING_MARKER` in the always-loaded file. `seed.md §14` was reworded in place to authorize relocating Article-level detail (not just narration/appendices) to the annex. The enforced soft target dropped from 38,500 to **34,000** (pinned by the always-loaded budget test, `CLAUDE_TARGET_MAX`), taking `CLAUDE.md` from 38,479 to 33,679 bytes (~6.3k headroom under the hard cap, up from ~1.5k). Hard cap, precedence chain (Art I.4), and the hook→Article mapping (Art VIII) are unchanged.

---

## 2 — Enforcement-mechanism narration

These passages explain *how* the structural enforcement works. The binding rules they support live in the cited Articles of `CLAUDE.md`.

### Consent gates (Article IV gates A/B/C, Article VII)

Each consent command (`/approve-spec`, `/approve-swarm`, `/grant-commit`, `/grant-push`) is a slash command typed by the user. The `consent_gate_grant` UserPromptSubmit hook parses the user's prompt **before Claude is invoked** and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) then allows Claude's slash-command-body write of the approval token only when the marker is present, fresh (≤ `consent.gate_marker_ttl_seconds`, default 120), and slug-matched; the marker is single-use and deleted on the allowed write. `/grant-push` is **not** a workflow-phase gate — it is a Bash-time consent for push to a protected branch (see Article VII). Slug derivation is centralized in `lib/common.mjs → canonicalSlug` (strip directory prefix + trailing `.md`) so the marker and the expected slug always agree, whether the user typed a bare slug, a filename, or a full path. The same guards block Claude from writing the marker file itself via Write/Edit/MultiEdit. Claude cannot reach the UserPromptSubmit code path, so it cannot forge consent.

### State-write discipline (Article IV gates A/B/C, Article VII, Article V)

Every SOP that writes under `.claude/state/` SHALL obey this two-tier tool mandate. It exists because the structural enforcement layer is **tool-aware**: the approval guards (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) validate the consent marker only on `Write`/`Edit`/`MultiEdit`, and `destructive_cmd_guard` (via `lib/common.mjs → writesConsentPath`) hard-blocks any Bash write to a consent path. An SOP that tells the model to "write the token" without binding the tool invites a Bash redirect that is structurally guaranteed to be blocked — a wasted, confusing detour. The mandate removes the ambiguity.

- **Tier 1 — consent artifacts.** The reserved consent paths — `.claude/state/commit_consent`, `.claude/state/push_consent`, `*.approval` under `spec_approvals/`·`swarm_approvals/`, and any `.*_grant` marker — SHALL be written with the **Write tool only**. Bash writes to these paths (redirect `>`/`>>`, heredoc, `tee`, `cp`, `mv`, `install`, `truncate`, `dd`, `ln`, `sed -i`, or a programmatic `writeFile`/`open(...,'w')`) are blocked by `destructive_cmd_guard` and SHALL NOT be attempted. Bash MAY still compute the *values* that go into the token (`date +%s` for the epoch, `git log -1 --format=%h` for the SHA) — those are reads, not consent-path writes. The token's bytes reach disk only through the Write tool, which is the single path the approval guards inspect.
- **Tier 2 — workflow / runtime state.** Non-consent state files (`workflow.json`, `harness_state`, `last_test_result`, `.harness_active`, `tdd/<slug>.json`, `harness/<slug>.log`, and the like) are NOT consent paths and are NOT guard-blocked. Prefer the **Write tool** for them. Bash is permitted ONLY through shell **builtins** (`>` redirect, `:`) which are PATH-independent; an external write-binary (`tee`, `sed -i`) SHALL NOT be used. Marker *deletion* via `rm -f` is the sole sanctioned external-binary exception (there is no builtin delete), and the marker-then-state ordering of Article V depends on it.
- **Path resolution and existence checks.** SHALL use the **Read** or **Glob** tool, never shell `dirname`/`basename`/`[ -f ]`. External coreutils binaries fail under a stripped PATH (observed: `command not found: dirname`), which derails a gate mid-write; the file tools are PATH-independent and cannot.

The four gate commands and the `harness`/`integrate`/`tdd`/`verify` SOPs cite this rule directly. It is the implementation-level expression of the consent-gate guarantee narrated above; it adds no new Article and contradicts none.

### Per-hook behavior detail (Article VIII)

The Article VIII table names every hook, its event, and the Article it enforces. The fuller behavior of the hooks whose logic does not fit a one-line cell:

- **`git_commit_guard`** (PreToolUse / Bash + Edit\|Write\|MultiEdit) — Bash: enforce branch-aware policy — `git commit` on a protected branch requires fresh `commit_consent`; `git push` on a protected branch requires fresh `push_consent`; both proceed without consent on non-protected branches; off-`branch_pattern` branches deny commits; detached HEAD denies both. Hard-block remaining forbidden flags (`--amend`, `--no-verify`, `reset --hard`, etc.). Write: gate writes to `.claude/state/{commit,push}_consent` and the matching `.{commit,push}_consent_grant` markers. **Branch topology (Art. VII):** after the detached deny and before the consent/pattern checks, enforce `git.workflow_model` (`direct-to-main | github-flow | ask`; `gitflow`/`trunk`/absent/unknown → `ask` via `resolveWorkflowModel`) over `git.release_branches` (glob list, default `["main"]`, matched by `matchAnyGlob`). On the primary working tree only — `isPrimaryWorkTree()` compares `git rev-parse --absolute-git-dir` against the absolute `--git-common-dir`; a linked (`/swarm-dispatch`) worktree differs, so topology is skipped there (carve-out), and a git failure returns true (fail toward enforcing). `direct-to-main`: a branch not in `release_branches` is blocked with a `git checkout <release> && git merge --ff-only <branch>` remediation. `github-flow`: a branch in `release_branches` is blocked ("create a feature branch first"). `ask`: pass (the guard never prompts; the branch question belongs to the `/commit` and `/harness` SOPs). A topology PASS falls through to the unchanged branch/consent policy — topology composes with consent, never masks it. **Precedence:** a non-`ask` model overrides Claude's generic branching instincts and the harness default; Claude SHALL NOT create/switch/delete branches except as the model prescribes (closes the `6e11f2f` stray-branch failure mode). `topologyDecision` + the three helpers live in `git_commit_guard.mjs` + `lib/common.mjs` (no new hook — count stays 22); `/init-project` detects the model best-effort via `detectWorkflowModel` and floors to `ask` on ambiguity.
- **`harness_continuation`** (Stop) — Three-rung gate: (1) `stop_hook_active` absent on payload; (2) `.claude/state/.harness_active` exists (session-scoped marker created by the harness skill on `continue`, deleted on `yielded`/`done`, cleaned by `memory_session_start.mjs` on session boundary); (3) `harness_state.state == "continue"`. When all three pass, emits `{"decision":"block","reason":"…invoke Skill(harness)…"}`. Sanity rail: marker-slug-vs-`workflow.json`-slug mismatch logs WARN to `harness_continuation.log` without changing the decision. Silent on any rung fail. Never writes consent markers.
- **`process_lifecycle_guard`** (PreToolUse / Bash) — Advisory. Surfaces `landmines.md → lsof-port-kill-takes-firefox-with-it` and `conventions.md → dev-server-ownership` (verbatim + interpretation) before any kill/lsof/serve Bash. Never blocks.
- **`consent_gate_grant`** (UserPromptSubmit) — Detect `/approve-spec`/`/approve-swarm`/`/grant-commit`/`/grant-push` in user input and write the gate-specific consent marker — runs OUTSIDE Claude's tool boundary so Claude cannot forge it.
- **`spec_approval_guard`** / **`swarm_approval_guard`** (PreToolUse / Edit\|Write\|MultiEdit) — Validate the fresh `.spec_approval_grant` / `.swarm_approval_grant` marker before allowing approval-token writes; block self-approval inside spec markdown; block direct writes to the marker.

### Skill provenance and the manifest (Article XI / seed.md §17)

The build script `scripts/build-manifest.mjs` reads each SKILL.md's `owner:` value and emits the canonical baseline-skill set into the shipped manifest at `obj/template/.claude/manifest.json` under `owners.skills` (a JSON object mapping slug → `"baseline"`). The recursive install copies the manifest straight to `<target>/.claude/manifest.json` (same path inside the `.claude/` subtree, no special-case). The CLI separately writes `<target>/.claude/.baseline-manifest.json` post-install as a runtime sha256 table of the target's actual on-disk contents (used by `doctor` and `upgrade`) — do not conflate the two. The audit at `.claude/skills/audit-baseline/audit.mjs` consumes `manifest.owners.skills` as the canonical baseline-skill enumeration (the previous hard-coded `EXPECTED_SKILLS` set is removed); it reads the manifest from `<root>/.claude/manifest.json` with a fallback to `<root>/obj/template/.claude/manifest.json`, re-derives sha256 hashes from `manifest.files` for every path under `.claude/skills/<slug>/` whose slug appears in `owners.skills`, and compares against on-disk content. Mismatches surface as `hash mismatch at <path>`; a baseline-listed slug missing from disk surfaces as `baseline skill missing`. These are hard FAIL — drift detection has no opt-out. Cryptographic supply-chain attestation, signed lock files, and per-skill aggregate merkle hashes are non-goals; the per-file `manifest.files` map already covers every file in every skill directory.

### Durable local thread trail (Article IX clause 8)

`.claude/memory/_thread.md` is a third, **local + durable** memory class for cross-session conversation continuity — distinct from the committed/curated canonical seven and from the overwritten-every-turn `_resume.md`. Its content is gitignored (only `src/memory/_thread.template.md` ships) and it is excluded from `/memory-flush`'s reset path, so a shelved thread survives a flush or `/clear`.

It is **model-internal**: Claude Code performs shelve and resume automatically; the human never invokes them, and there is no skill or command surface (so the audited skill/command counts are unchanged). Four `.mjs` Foundation helpers in `.claude/hooks/lib/` back it:

- **`thread_store.mjs`** — all `_thread.md` / cursor / candidate I/O, the transcript event reader, and the section render/parse (verbatim cues round-trip byte-identical via a JSON block embedded in an HTML comment). The trail is **bounded**: `appendEntry` calls `pruneTrail` after each shelve, evicting the oldest sections so at most `THREAD_MAX_SECTIONS` (default 20) remain. Eviction parses sections by the forge-proof base64 data block — never by the `## SHELVED` heading line, which a multi-line verbatim cue could otherwise spoof — and rebuilds the trail under an atomic temp+rename, so the most-recent N sections are always retained byte-identical.
- **`shelve_detect.mjs`** — `detect(...)` compares the latest user turn's subject against the active thread's opening subject (token-overlap heuristic) and STAGES a `ShelveCandidate` on divergence. Folded into the `memory_stop` Stop hook; **passive** — it emits nothing on stdout, so `harness_continuation` keeps the sole Stop-event block decision (Decision D1). Best-effort; never fails the turn.
- **`shelve_capture.mjs`** — `capture(...)` reads the cursor, extracts verbatim cues + open questions + in-flight files + next step over the span `[cursor → end]` (end = staged switch-point uuid for an auto-shelve, `now` for a model-initiated one; cross-session transcript mismatch → whole-transcript fallback), appends one section, and advances the cursor. Mechanical — NO model summary at shelve (Decisions D2 + D3).
- **`resume_transform.mjs`** — `readMostRecent(...)` plus a TTL cache (`readCache`/`writeCache`, file `.claude/state/thread_transform_cache.json`, TTL `project.json → memory.thread_transform_ttl_seconds`, default 86400). The transform itself (verbatim → surfaced summary) is inline main-context model work, cached so resume does not recompute within the TTL (Decision D5).

`memory_session_start.mjs` injects ONLY the most-recent section at SessionStart, bounded so the ~10KB envelope holds (Decision D3 bounding). The design rationale — extract verbatim cheaply at shelve, transform at resume for granularity control — and the full decision record live in `.claude/state/codesign/conversation-thread-shelving.json`.

---

### §II.A — bounded maker/checker charter (narrative + graduation rationale)

**What the charter authorizes.** Exactly one maker and one checker, on the Workflow runtime, for one round-trip. The maker implements a main-context contract inside an explicit `write_set`, making no design decisions; the checker reviews the maker's output and emits findings ranked by evidence. The maker and checker are workflow-runtime agents, not declared subagents — the baseline still ships exactly one subagent (`swarm-worker`), so the `§4.2` count is unchanged.

**Why oracle-binding is load-bearing.** Two LLMs left to confer will agree on a hallucination. The external literature is unambiguous: the generation-verification gap is real (models generate correct solutions but cannot reliably verify them, and self-critique can *reduce* accuracy via false positives), and LLM-as-judge carries position, verbosity, and self-preference bias (judges favor their own generations). So a finding counts only when it is mechanically grounded — a failing test, a guard block, a structural violation. Research/documentation evidence is advisory (surfaced, lower-confidence, never blocking alone); a bare opinion is not a finding at all.

**Two corollaries encoded in clause 2.** (a) *Anti-circularity*: the checker's grounding test or relation must derive from intended behavior or the spec, never from the maker's implementation — a test generated from the code under test encodes the bug as "correct" (the documented "circularity of error"). (b) *Self-preference*: because the maker and checker may share a model family, a non-mechanical finding is advisory by construction.

**Why bounded, and the graduation gate.** Multi-agent debate improves correctness only when paired with verification; unverified debate adds noise and can hurt. So the bound is keyed to *verification capability*, not a head-count or a calendar. The PoC already proved the substrate is functional, governable (`tdd_order_guard`, `verify_pass_guard`, `swarm_boundary_guard` fire on workflow agents), and oracle-capable. `§II.A` therefore stays a bounded exception until: (a) ≥ 3 governed round-trips where every blocking finding was mechanically grounded; (b) zero false-positive blocking findings across that window (a wrong block implies an anti-circularity violation); (c) a clean `/security` review of the checker's oracle artifacts; (d) maintainer ratification of a future permanent Article II rewrite. The numeric floor is checkable without telemetry — the evidence is read from the `/workflows` run record. A temporal sunset was rejected: boundedness here is capability-shaped, not calendar-shaped, and a sunset adds an expiry-cliff failure mode with no evidentiary basis.

**Relationship to the downstream pieces.** This charter is the definitive one (`-c732`), absorbing the prior `-9360`. The multi-maker/checker scaling, the tier dial (`-1a2d`), the mutation oracle (`-f029`), the durable plan schema (`-424f`), and the gate taxonomy (`-9008`) are NOT part of it; they depend on the future permanent rewrite that the graduation gate guards. Empirical evidence: `docs/archive/2026-06-05/maker-checker-poc/`.

---

## 3 — Appendix A — Where things live (reference)

| Path | Role |
|---|---|
| `.claude/hooks/` | 22 hook scripts (17 write/run-boundary + 4 lifecycle + 1 input-boundary). Node ESM (.mjs), no jq. |
| `.claude/agents/` | 1 baseline subagent: `swarm-worker` (rendered from `src/agents/swarm-worker.template.md`) |
| `.claude/skills/` | 40 skills: artifact (4) + phases (10) + workers (5) + spec helpers (4) + orchestration (3) + memory (1) + navigation (1) + phase helpers (1) + generators (1) + shared globals (7) + audit (1) + alt tracks (1) + maintenance (1) |
| `.claude/commands/` | 6 commands: 4 consent gates (`approve-spec`, `approve-swarm`, `grant-commit`, `grant-push`) + `init-project` (bootstrap) + `init-project-doctor` (doctor) |
| `.claude/memory/` | 7 canonical knowledge files + `_pending.md` (staging) + `_resume.md` (continuity snapshot) + `_thread.md` (durable local thread trail) + `README.md` |
| `.claude/project.json` | per-project config (test/lint cmd, TDD globs, destructive patterns, swarm config, additions). Populated by `/init-project`. |
| `.claude/settings.json` | hook wiring + permissions |
| `.claude/state/` | runtime: `workflow.json`, `commit_consent`, `push_consent`, `spec_approvals/`, `swarm_approvals/`, `swarm/`, `harness/<slug>.log`, `last_test_result` |
| `.mcp.json` | three baseline MCP servers: `context7`, `plantuml`, `playwright` |
| `src/` | pristine ship-time templates for every file `/init-project` modifies (overlay source for `npx @friedbotstudio/create-baseline`) |
| `docs/init/seed.md` | genesis prompt — governing specification of the baseline |
| `CLAUDE.md` | in-session constitution (binding rules, capped at 40,000 chars) |
| `.claude/CONSTITUTION.md` | this annex — amendment history, mechanism narration, reference appendices |

## 4 — Appendix B — Skill index (reference)

**Artifact drafting (4)** — each ships a `template.md`:
- `intake` (Phase 1), `brd` (cross-functional pre-spec), `spec` (Phase 4, diagram-driven), `rca` (out-of-band postmortem)

**Workflow phases (10)** — auto-invocable; orchestrator chains them:
- `triage`, `scout`, `research`, `tdd`, `simplify`, `security`, `integrate`, `document`, `archive`, `commit`

**Phase workers (5)** — execute pre-decided recipes; mandatorily invoke a sub-skill:
- `scenario`, `implement`, `verify`, `prose`, `design-ui`

**Spec helpers (4)**:
- `spec-lint`, `spec-render` (user-only), `spec-diagram-review`, `spec-traceability-review`

**Orchestration (3)**:
- `harness` (user + model invokable; Stop-hook auto-continued), `swarm-plan`, `swarm-dispatch`

**Memory (1)**:
- `memory-flush`

**Phase helpers (1)** — invoked by entry phases as a Step 0.5 / Step 1.5 gate; never on user-direct invocation:
- `brainstorm` — PM-mode requirement capture via Socratic dialogue. Invoked by `/intake`, `/spec`, `/tdd` at Step 0.5 when `workflow.json → skip_brainstorm: false`. Writes `docs/brief/<slug>.md` with structured fields (actor, trigger, current state, desired state, non-goals, solution-leakage). Stage 2 discipline-assertor structurally forbids solution-shaped tokens in probes. See Article X.3.

**Generators (1)** — on-demand; not a workflow phase, never blocks a commit:
- `whatsnew` — emits a structured "what's new" fragment to `.claude/state/whatsnew/<slug>.json` (gitignored, transient) for a set of changes; an optional `project.json → whatsnew.route_workflow` names a per-project routing workflow that consumes the fragment. Never writes `CHANGELOG.md` (owned solely by `@semantic-release/changelog` in CI). Replaced the former Phase 11.5 `changelog` skill.

**Navigation (1)** — the default tool for code-navigation questions in any language; prefer it over the `Explore` agent and global grep when a question asks "where does X come from", "what API populates Y", "what wraps Z", or "find the file for feature F" (CLAUDE.md Article X.5):
- `code-browser` — the language-agnostic **universal walk** (entry → imports → IO boundary) is the primary path, regardless of language. For JS/TS, optional accelerators speed it up: `discover.mjs` writes a per-repo `conventions.json` once, then `walk.mjs` runs deterministically returning flat `byHook` / `byService` / `byApiCall` / `byComponent` indexes. The walk falls back to `Explore`/`grep` only on no resolvable structure or a dead-ended walk; pure full-text search and type/util lookups stay grep's domain. Read-only.

**Shared globals (7)** — one written for this baseline, six vendored from external sources with their upstream licenses preserved in `LICENSE` + `NOTICE` alongside each skill:
- `claude-automation-recommender` — vendored from Anthropic's `claude-code-setup` plugin, Apache 2.0.
- `code-structure` — written for this baseline (Friedbot Studio). Mandatory on every code-generation step.
- `humanizer` — vendored from [`blader/humanizer`](https://github.com/blader/humanizer), MIT.
- `documentation` — vendored from Anthropic's `claude-code-setup` plugin, Apache 2.0.
- `technical-tutorials` — vendored from [`jonathimer/devmarketing-skills`](https://github.com/jonathimer/devmarketing-skills), MIT.
- `copywriting` — vendored from [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills), MIT.
- `impeccable` — vendored from [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable), Apache 2.0.

**Audit (1)**:
- `audit-baseline` — drift check between this constitution + seed.md and the implementation

**Alternate tracks (1)** — stripped-down workflows routed via `/triage`:
- `chore` — for tasks that need no TDD (documentation, governance counts, vendored content, configuration, formatting, dependency bumps, consolidation). Skips `/scenario` and `/implement`; runs edits directly; routes through `simplify` / `integrate` / `document` only when their triggers apply. `verify`, `archive`, `/grant-commit`, `/commit` mandatory. Not a bypass — silent skips of triggered conditional phases are forbidden.

---

## 5 — Article X project-amendment detail (reference)

The binding clauses for project amendments X.1–X.4 live in `CLAUDE.md` Article X. This section holds the *elaborative rule tables* relocated from CLAUDE.md to hold the 40,000-char cap (Art I.6 / seed.md §14). Nothing here overrides the binding clause in CLAUDE.md; where this detail and the clause appear to conflict, **CLAUDE.md governs**. Article X.5 (navigation routing) stays in full in CLAUDE.md and has no annex detail.

### 5.1 — X.1 Copy register and skill overrides (detail)

The `impeccable` skill (Apache 2.0, vendored) declares "Shared design laws" with absolute bans, including:

- No em dashes (`—`, or `--` as a substitute).
- The hero-metric template.
- Glassmorphism as default, gradient text, side-stripe borders > 1px, modal-first thinking, identical card grids.

These bans bind **only on user-facing copy** — surfaces a public reader sees as rendered marketing or product prose:

| Scope | Bans apply? | Examples |
|---|---|---|
| User-facing copy | YES | `site-src/**/*.njk`, `site-src/_data/site.json` user-visible strings, marketing emails, the rendered docs site |
| Internal governance | NO | `CLAUDE.md`, `docs/init/seed.md`, `PRODUCT.md`, `DESIGN.md` |
| Project source documents | NO | `README.md`, `bin/cli.js` help/error text, `.claude/skills/*/SKILL.md` |
| Memory bodies | NO | `.claude/memory/*.md` entries |
| Inline code / data samples | NO | `<code>` / `<pre>` blocks that quote literal data, CLI output, or canonical entry shapes |

The constitutional voice in scoped-OUT surfaces uses em dashes deliberately. Audits run by `impeccable` (and any future register-aware critique skill) SHALL apply the bans only within the scoped-IN surfaces. This override does not delete bans from the impeccable skill; it scopes them. Other shared design laws (color strategy, theme commitment, typography hierarchy, motion vocabulary, accessibility floor) remain in force everywhere Claude generates UI. Future "impeccable says X, but we ship Y" decisions get a row in the same scope table without re-amending the constitution; each row SHALL cite the scoped rule, the scope decision, and a one-line rationale (in-flight examples in §1 "X.1 — copy-register scoping").

### 5.2 — X.2 Design-task routing (detail)

Design / development / copy are separate concerns: design lives behind `design-ui`; development is the rest of `/tdd`; copy is governed by Article X.1 plus the `prose` skill's register choice. The three lanes may touch the same file for different concerns; they SHALL NOT substitute for one another.

| Rule | Binding |
|---|---|
| A spec whose `write_set` intersects `project.json → tdd.ui_globs` SHALL declare a populated `## Design calls` section, one row per design surface. | `spec_design_calls_guard` (Art. VIII) at the Write boundary; `/spec-lint` at preflight. |
| `/tdd` Step 6 SHALL invoke `Skill(design-ui, task_brief)` once per `## Design calls` row before Step 7 (verify). | `tdd` skill SOP. |
| `design-ui` SHALL NOT write product code. Its only writes are the state file at `.claude/state/design/<slug>.json`, snapshots under `docs/design/<slug>.*.md`, and memory candidates. The product-code writes happen inside `impeccable` invocations. | `design-ui` SKILL.md. |
| `design-ui` SHALL classify incoming intents at Stage 0 (design / development / copy). A misrouted intent returns one of two terminal states: `final_state: "not_a_design_task"` (single-lane misroute) with `correct_lane`, OR `final_state: "mixed_brief"` (multi-lane misroute) with a structured `lane_split` array. Neither writes code. | `design-ui` Stage 0 + `references/design-vs-development.md`. |
| Iteration cap: `audit → polish` loops SHALL terminate after 3 iterations with `final_state: "needs_human"` if P0 ≥ 1 or P1 > 0 persist. P0 issues block (do not loop). | `design-ui` SKILL.md + `references/orchestration.md`. |
| Multi-step impeccable recipes SHALL ask the user before proceeding. Single-step recipes SHALL auto-execute. | `references/intent-table.md` `mode` column. |

The vendored `impeccable` skill stays untouched (Article IX). `design-ui` is the structural seam between workflow phases and `impeccable`; bypassing it inside a workflow phase is a violation of Article X.2.

### 5.3 — X.3 Entry-phase brainstorm (detail)

The brainstorm helper captures the requirement via Socratic dialogue (actor, trigger, current state, desired state, non-goals, solution-leakage detection) and writes the result to `docs/brief/<slug>.md`. The entry skill reads that brief as primary input for template-fill.

| Rule | Binding |
|---|---|
| `workflow.json → skip_brainstorm` defaults to `false` when absent. Read-time defaults via `.claude/skills/brainstorm/workflow-defaults.mjs → withDefaults`. | `brainstorm/SKILL.md` Stage 0 contract; AC-008. |
| Stage 2 dialogue SHALL NOT propose solutions. Discipline is structurally enforced by `.claude/skills/brainstorm/discipline.mjs → scanTurn(text)`, which scans every model-emitted probe for solution verbs (`implement`, `refactor`, `add X`), library names (Redis, PostgreSQL, etc.), and proposal phrasing (`we could`, `I recommend`). | `brainstorm/references/interview-protocol.md`; AC-003. |
| Stage 2 iteration cap is 5; unclosed gaps become `open_questions` in the brief. Stage 3 confirm-cycle cap is 5; exhaustion returns `final_state: "needs_human"`. | `brainstorm/probe-loop.mjs`; AC-004 boundary. |
| `/intake` re-invocation on a slug whose `docs/brief/<slug>.md` already exists SHALL short-circuit and read the existing brief; no re-dialogue. | `brainstorm/skip-check.mjs → shouldSkipForExistingBrief`. |
| `chore` and `freeform` tracks do NOT have an entry-skill seam where brainstorm can fire; the helper is silent on those tracks by construction. | Article IV phase ordering. |

The opt-out flag is set at `/triage` time by `--no-brainstorm`, or detected heuristically when the request already carries a complete actor + trigger + desired-state framing (surfaced via `AskUserQuestion`; AC-010 governs parsing). `Skill(brainstorm)` runs in main context per Article II — no subagent delegation; the Stage 2 discipline assertor is the only programmatic gate.

### 5.4 — X.4 `/spec` codesign mode (detail)

The codesign mode identifies load-bearing technical decision points (where engineer domain expertise is the deciding factor — computer vision approach, model architecture, numerical method, IPC pattern, kernel scheduling), presents each with Claude's recommended option and rationale, and captures the engineer's response (approve / suggest alternative / discuss tradeoff) via `AskUserQuestion`. The engineer's verbatim rationale becomes canonical when they override Claude's recommendation.

| Rule | Binding |
|---|---|
| `workflow.json → codesign_mode` defaults to `false` when absent (opt-in). Set true by `/triage --codesign` or by manual edit. | `spec/SKILL.md` Step 1.5 contract; AC-008. |
| Decision-point detection runs via `.claude/skills/spec/decision-finder.mjs → findDecisionPoints({researchMemo, scoutReport})`. A research memo with ≥2 candidates carrying comparable tradeoffs surfaces as ≥1 decision point. | AC-005. |
| Per decision: Claude proposes the recommended option + 1–3 sentence rationale + `AskUserQuestion` (Approve / Suggest alternative / Discuss tradeoff). On `Suggest alternative`, capture the engineer's verbatim rationale via free-form turn. | AC-005 + AC-006 §Behavior #4. |
| The spec's `## Decisions` section SHALL render engineer verbatim as a `>` markdown blockquote, with chosen-option recorded as the engineer's pick (NOT Claude's recommendation when they diverge). | `decisions-writer.mjs → writeDecisionsSection`; AC-006. |
| `spec-lint` Check #4 fires when `codesign_mode: true` AND the saved spec lacks a `## Decisions` heading. Check #4 is suppressed entirely when `codesign_mode: false`. | `spec-lint/lint.mjs:checkCodesignDecisions`; AC-005 contract. |
| On `/integrate` failure classified as "needs spec change" with `codesign_mode: true`, `harness/codesign-reentry.mjs → writeRevisitContext` appends a revisit_context to `.claude/state/codesign/<slug>.json`. Next `/harness` re-invocation reads the context and re-enters codesign on the named decision. | AC-007; Article V integrate-failure decision tree. |
| Codesign decision revisit cap is 3 per decision point. The 4th revisit attempt terminates with `final_state: "needs_human"`. Hardcoded in `codesign-state.mjs → REVISIT_CAP`, parallel to design-ui's 3-iteration audit-polish cap. | AC-007 boundary. |

Codesign mode is opt-in (most workflows do not need it). `/triage`'s heuristic suggestion fires on a fixed keyword list (`computer vision`, `model architecture`, `numerical`, `cryptographic`, `consensus`, `realtime`, `kernel`, `distributed`, `algorithm design`) — it triggers a confirmation `AskUserQuestion`, never auto-sets. `/research` may write a memo-only codesign recommendation when no candidate dominates on tradeoffs; per Article II it cannot auto-flip flow state — the user opts in via `/triage --codesign` or a manual `workflow.json` edit.
