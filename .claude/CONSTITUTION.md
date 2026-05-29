# Claude Code Baseline — Constitution Annex

This file is the **read-on-demand companion** to `CLAUDE.md`. `CLAUDE.md` is the binding in-session constitution and is capped at 40,000 characters (Article I.6); to hold that cap it carries binding rules only. This annex holds everything that is *explanatory rather than binding*: amendment history, enforcement-mechanism narration, and the reference appendices.

Nothing in this annex overrides `CLAUDE.md`. Where this annex and `CLAUDE.md` appear to conflict, **`CLAUDE.md` governs** (and behind it, `docs/init/seed.md` per Article I.4). Read this file when you need the *why* or the *how* behind a rule whose *what* lives in the constitution.

---

## 1 — Amendment history

### Post-§18 amendment (2026-05-21) — workflow tracks

Workflow track definitions live in `.claude/workflows.jsonl` per `docs/init/seed.md §18`. The phase-ordering rules and entry-point classifications in Article IV remain binding; every Track declared in `workflows.jsonl` SHALL satisfy them plus the additional invariants in seed.md §18.3 (I1..I11). `/triage` reads `workflows.jsonl`, validates each Track against §18, classifies the user's request via LLM reasoning over `name + description + selector_hints`, confirms via `AskUserQuestion`, and materializes the chosen Track's DAG into the TaskList (via `src/cli/track-tasklist-materializer.js`). The 4 canonical tracks shipped in the pristine template are byte-equivalent to Article IV's hardcoded templates per spec AC-016. The harness migrates pre-§18 `workflow.json` files (carrying `entry_phase` + no `track_id`) one-shot at preflight via `src/cli/workflow-migrator.js`. `/init-project doctor` (sub-command) detects schema / invariant / mirror drift and offers interactive fixes.

### X.1 — copy-register scoping (ongoing)

Article X.1 scopes the `impeccable` "Shared design laws" bans to user-facing copy only. Future "impeccable says X, but we ship Y on purpose" decisions get a row in the Article X.1 scope table without re-amending the constitution. Examples already in flight: the meta-strip on the landing (qualified in PRODUCT.md anti-references as "structural counts naming load-bearing components"), and the em-dash scoping itself. New rows SHALL cite the impeccable rule being scoped, the scope decision, and a one-line rationale.

---

## 2 — Enforcement-mechanism narration

These passages explain *how* the structural enforcement works. The binding rules they support live in the cited Articles of `CLAUDE.md`.

### Consent gates (Article IV gates A/B/C, Article VII)

Each consent command (`/approve-spec`, `/approve-swarm`, `/grant-commit`, `/grant-push`) is a slash command typed by the user. The `consent_gate_grant` UserPromptSubmit hook parses the user's prompt **before Claude is invoked** and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (`spec_approval_guard`, `swarm_approval_guard`, `git_commit_guard`) then allows Claude's slash-command-body write of the approval token only when the marker is present, fresh (≤ `consent.gate_marker_ttl_seconds`, default 120), and slug-matched; the marker is single-use and deleted on the allowed write. `/grant-push` is **not** a workflow-phase gate — it is a Bash-time consent for push to a protected branch (see Article VII). Slug derivation is centralized in `lib/common.mjs → canonicalSlug` (strip directory prefix + trailing `.md`) so the marker and the expected slug always agree, whether the user typed a bare slug, a filename, or a full path. The same guards block Claude from writing the marker file itself via Write/Edit/MultiEdit. Claude cannot reach the UserPromptSubmit code path, so it cannot forge consent.

### Per-hook behavior detail (Article VIII)

The Article VIII table names every hook, its event, and the Article it enforces. The fuller behavior of the hooks whose logic does not fit a one-line cell:

- **`git_commit_guard`** (PreToolUse / Bash + Edit\|Write\|MultiEdit) — Bash: enforce branch-aware policy — `git commit` on a protected branch requires fresh `commit_consent`; `git push` on a protected branch requires fresh `push_consent`; both proceed without consent on non-protected branches; off-`branch_pattern` branches deny commits; detached HEAD denies both. Hard-block remaining forbidden flags (`--amend`, `--no-verify`, `reset --hard`, etc.). Write: gate writes to `.claude/state/{commit,push}_consent` and the matching `.{commit,push}_consent_grant` markers.
- **`harness_continuation`** (Stop) — Three-rung gate: (1) `stop_hook_active` absent on payload; (2) `.claude/state/.harness_active` exists (session-scoped marker created by the harness skill on `continue`, deleted on `yielded`/`done`, cleaned by `memory_session_start.mjs` on session boundary); (3) `harness_state.state == "continue"`. When all three pass, emits `{"decision":"block","reason":"…invoke Skill(harness)…"}`. Sanity rail: marker-slug-vs-`workflow.json`-slug mismatch logs WARN to `harness_continuation.log` without changing the decision. Silent on any rung fail. Never writes consent markers.
- **`process_lifecycle_guard`** (PreToolUse / Bash) — Advisory. Surfaces `landmines.md → lsof-port-kill-takes-firefox-with-it` and `conventions.md → dev-server-ownership` (verbatim + interpretation) before any kill/lsof/serve Bash. Never blocks.
- **`consent_gate_grant`** (UserPromptSubmit) — Detect `/approve-spec`/`/approve-swarm`/`/grant-commit`/`/grant-push` in user input and write the gate-specific consent marker — runs OUTSIDE Claude's tool boundary so Claude cannot forge it.
- **`spec_approval_guard`** / **`swarm_approval_guard`** (PreToolUse / Edit\|Write\|MultiEdit) — Validate the fresh `.spec_approval_grant` / `.swarm_approval_grant` marker before allowing approval-token writes; block self-approval inside spec markdown; block direct writes to the marker.

### Skill provenance and the manifest (Article XI / seed.md §17)

The build script `scripts/build-manifest.mjs` reads each SKILL.md's `owner:` value and emits the canonical baseline-skill set into the shipped manifest at `obj/template/.claude/manifest.json` under `owners.skills` (a JSON object mapping slug → `"baseline"`). The recursive install copies the manifest straight to `<target>/.claude/manifest.json` (same path inside the `.claude/` subtree, no special-case). The CLI separately writes `<target>/.claude/.baseline-manifest.json` post-install as a runtime sha256 table of the target's actual on-disk contents (used by `doctor` and `upgrade`) — do not conflate the two. The audit at `.claude/skills/audit-baseline/audit.mjs` consumes `manifest.owners.skills` as the canonical baseline-skill enumeration (the previous hard-coded `EXPECTED_SKILLS` set is removed); it reads the manifest from `<root>/.claude/manifest.json` with a fallback to `<root>/obj/template/.claude/manifest.json`, re-derives sha256 hashes from `manifest.files` for every path under `.claude/skills/<slug>/` whose slug appears in `owners.skills`, and compares against on-disk content. Mismatches surface as `hash mismatch at <path>`; a baseline-listed slug missing from disk surfaces as `baseline skill missing`. These are hard FAIL — drift detection has no opt-out. Cryptographic supply-chain attestation, signed lock files, and per-skill aggregate merkle hashes are non-goals; the per-file `manifest.files` map already covers every file in every skill directory.

---

## 3 — Appendix A — Where things live (reference)

| Path | Role |
|---|---|
| `.claude/hooks/` | 22 hook scripts (17 write/run-boundary + 4 lifecycle + 1 input-boundary). Node ESM (.mjs), no jq. |
| `.claude/agents/` | 1 baseline subagent: `swarm-worker` (rendered from `src/agents/swarm-worker.template.md`) |
| `.claude/skills/` | 40 skills: artifact (4) + phases (11) + workers (5) + spec helpers (4) + orchestration (3) + memory (1) + navigation (1) + phase helpers (1) + shared globals (7) + audit (1) + alt tracks (1) + maintenance (1) |
| `.claude/commands/` | 6 commands: 4 consent gates (`approve-spec`, `approve-swarm`, `grant-commit`, `grant-push`) + `init-project` (bootstrap) + `init-project-doctor` (doctor) |
| `.claude/memory/` | 7 canonical knowledge files + `_pending.md` (staging) + `_resume.md` (continuity snapshot) + `README.md` |
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

**Workflow phases (11)** — auto-invocable; orchestrator chains them:
- `triage`, `scout`, `research`, `tdd`, `simplify`, `security`, `integrate`, `document`, `archive`, `changelog` (Phase 11.5), `commit`

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

**Navigation (1)** — the default tool for code-navigation questions; prefer it over global grep when a question asks "where does X come from", "what API populates Y", "what wraps Z", or "find the file for feature F":
- `code-browser` — walks the import graph from a page or entry file to the network boundary, returning flat `byHook` / `byService` / `byApiCall` / `byComponent` indexes. `discover.mjs` writes a per-repo `conventions.json` once; `walk.mjs` then runs deterministically in milliseconds. Read-only.

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
