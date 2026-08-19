# Claude Code Baseline — In-Session Constitution

This file binds Claude's behavior — Claude Code, in this codebase, in this session. Every rule below is mandatory unless waived by an explicit `exceptions` entry in `.claude/state/workflow.json` (set only by `/triage`).

**Genesis prompt.** `docs/init/seed.md` is the governing specification of this baseline. When it and this constitution conflict, **seed.md governs** and you SHALL stop and surface the drift before acting. When this constitution and the implementation conflict, **this constitution governs** and the implementation SHALL be corrected.

**Enforcement.** The 26 hooks in `.claude/hooks/` are the enforcement layer, mapped to their Articles in **Article VIII**.

---

## Article I — Authority and precedence

1. **Genesis** — `docs/init/seed.md` is the source of truth for the baseline's shape, components, and rebuild protocol.
2. **Constitution** — `CLAUDE.md` is the source of truth for Claude's in-session behavior.
3. **Implementation** — hooks, skills, commands, subagent, MCP servers, and config actuate and enforce (1) and (2).
4. **Order of precedence** — `seed.md` > `CLAUDE.md` > implementation. Lower binds higher only via amendment in seed.md, which then propagates to this file, then to disk.
5. **Project amendments** — Article XI reserves space for project-owner amendments. They bind alongside the baseline Articles but **SHALL NOT** contradict them.
6. **Size cap (this file)** — `CLAUDE.md` SHALL NOT exceed **40,000 characters** and carries binding rules only; history, narration, and reference appendices live in the annex. `audit-baseline` enforces the cap, which also binds the byte-equal mirror `src/CLAUDE.template.md`. The governance suite pins a tighter advisory target (seed.md §14).

## Article II — Architectural principle

**Decisions live in main context. Subagents only execute pre-decided recipes in parallel or in the background.**

The baseline ships exactly **one** subagent: `swarm-worker`. Its sole sanctioned use is `Skill(scenario)` then `Skill(implement)` against a fully-specified recipe in an isolated git worktree during `/swarm-dispatch`. It SHALL NOT make design choices, pick abstractions, or expand scope, and SHALL NOT be invoked outside `/swarm-dispatch`.

A bounded maker/checker round-trip MAY run on the Workflow runtime under **§II.A** — oracle-bound read-only checkers may fan out; one maker, judgment checkers, and the one-subagent count stay bound. Full text: `seed.md §4.2`.

Every other capability — code authoring, scouting, research, security and spec review, prose, UI design — is a **skill** running in main context. Five declare a mandatory sub-skill contract:

| Skill | Mandatory sub-skill | Conditional |
|---|---|---|
| `scenario` | `code-structure` | — |
| `implement` | `code-structure` | current-docs check for third-party APIs (`context7`) |
| `design-ui` | `impeccable` | — |
| `prose` | `humanizer` (always) | `copywriting` / `documentation` / `technical-tutorials` by register |
| `technical-writer` | `technical-writing`, `reader-level`, `humanizer` | — |

You SHALL NOT route **binding judgment** — a written decision or production change (design tone, code architecture, security calls, scenario selection) — through a subagent. **Read-only advisory subagents** (Explore/Plan, scout/research gathering, §II.A checkers) MAY gather and advise; they write nothing and decide nothing. Full clause: `seed.md §4.2-A`.

## Article III — Session-start procedure (MANDATORY)

On every new session, before any work, you SHALL:

1. **Read** `.claude/project.json` and check the `configured` field.
2. **If `configured: false`** — `/init-project` has not run. The repo is in **project-agnostic mode**, a sanctioned state: hooks are active but `test_runner` and `lint_runner` run in guide mode. Greet with the verbatim framing in annex §2, then proceed with whatever the user asks — the mode is **allowed** and `/init-project` is not required. `setup_guard` reminds on writes but does **not** block; every other guard stays hard.
3. **If `configured: true`** — read `docs/init/seed.md` §16 if present, then tell the user:
   > "Configured for `<stack>`. Run `/triage \"<request>\"` to start a workflow, or `/harness` for the full pipeline."
4. **Memory check.** `memory_session_start` injects the index — entry counts, stale rows, concepts, resume snapshot. It reports the `_pending.md` count and prompts no action; Phase 10.7 flushes inside every workflow.
5. **Git-repo check.** Run `git rev-parse --is-inside-work-tree 2>/dev/null`. If non-zero, surface once per session that gate C and `commit` are auto-excepted and the workflow ends after `/archive`. A sanctioned mode — Art. IV phase 11 and Art. VII are git-conditional.
6. Once per session is sufficient. You SHALL NOT repeat the greeting on every prompt.

## Article IV — Workflow ordering (MANDATORY)

The 11-phase workflow is the only sanctioned path from request to commit. Phase ordering is enforced at the Write boundary by `track_guard` (Art. VIII).

| # | Phase | Invocation | Output |
|---|---|---|---|
| 1 | Intake | `/intake` (optionally `/brd`) | `docs/intake/<slug>.md` |
| 1a | **Approve direction** (gate A) | user runs **`/approve-direction`** | approval token |
| 2 | Scout | `/scout` | `docs/scout/<slug>.md` |
| 3 | Research | `/research` | `docs/research/<slug>.md` |
| 4 | Spec | `/spec` (+ `/spec-lint`, reviews) | `docs/specs/<slug>.md` |
| 5 | Review (machine) | shippability + checker fan-out; **no human gate** | BLOCKED halts entry to 6 |
| 6 | TDD (solo) | `/tdd` | code |
| 6a | TDD (swarm) | `/swarm-plan` | `.claude/state/swarm/<slug>.json` |
| 6b | **Approve swarm** (gate B) | user runs **`/approve-swarm <slug>`** | approval token |
| 6c | Swarm dispatch | `/swarm-dispatch` | code (parallel waves) |
| 7 | Simplify | `/simplify` | clean diff |
| 8 | Security (optional) | `/security` | `docs/security/<slug>-<date>.md` |
| 9 | Integrate | `/integrate` | binding verify verdict |
| 10 | Document | `/document` | docs |
| 10.5 | Archive | `/archive` | `docs/archive/<date>/<slug>/` |
| 10.6 | Roadmap sync | `/roadmap-sync` (every committing track) | roadmap synced (fail-open) |
| 10.7 | Memory flush | `/memory-sync` | curated memory + reset `_pending.md` |
| 11 | **Grant commit** (gate C) + commit | user runs **`/grant-commit`**, then `/commit` | commit |

**Mandatory rules:**

- You SHALL NOT skip or reorder phases.
- A phase may be bypassed only by (1) `/triage`'s `exceptions` array, or (2) the post-`tdd` **right-size gate** (`rightsize-gate.mjs`): fail-open and **additive-only**, it may auto-skip a subset of `{simplify, document}`, **never `security`** or a core phase, and never overrides an existing exception. Gated by `velocity.rightsize.enabled`. seed.md §5.
- **Phase 6c and Phase 11 are git-conditional.** On a non-git tree, `/triage` SHALL auto-add `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, and `commit` to `exceptions`; Phase 6 routes to solo `/tdd`, and the workflow ends after `/archive`. Worktree isolation requires git; `swarm.isolation: "shared"` is sanctioned only for git projects opting out of worktrees, not as a non-git fallback.
- The three consent gates (A, B, C) are **commands**, not skills — structurally un-invokable by Claude. You SHALL NOT self-approve.
- **Gate C is branch-conditional (seed.md §18.4, §11).** Only a github-flow autonomous feature landing omits it, resolved at seed time by `isAutonomousFeatureLanding()` (fail-safe false); `/commit` then pushes + opens a PR, yielding on failure. Everywhere else gate C yields, `git_commit_guard` the backstop.
- **Why the gates hold.** Each consent command is typed by the user, so `consent_gate_grant` (UserPromptSubmit) writes its marker **before Claude is invoked**. Claude cannot reach that path, so it cannot forge consent. `/grant-push` is Bash-time push consent, not a gate. Handshake: annex §2.
- **Out-of-band**: `/rca` writes `docs/rca/<slug>.md`; not a phase.

**Entry points. Step 0 — leanest-safe-track triage (seed.md §5):** `/triage` classifies novelty FIRST — `pattern-copy | spec-derived | novel | ambiguous` — with cited evidence, recorded as `workflow.json → novelty` + `novelty_evidence`. The DEFAULT is the leanest track whose guardrails cover the risk; a heavier pick requires a named `track_reason`. Step 0 also writes `skip_brainstorm` explicitly (XI.3).

- New feature → `intake`. Bugfix → `spec` or `tdd`. Quickfix → `tdd`.
- Chore → the `chore` track when the request needs **no failing-test-driven code change**. Skips `/scenario` and `/implement`; `verify` / `simplify` / `integrate` / `document` resolve on the diff; `archive`, gate C, `/commit` stay mandatory.
- Freeform → ad-hoc **heterogeneous** batches. Every pre-commit phase is excepted; all 26 hooks stay active, including `tdd_order_guard` and the gates.
- Chore/freeform: work needing a failing test SHALL route to `tdd` or higher.
- Epic / Epic-child → a multi-subtask feature runs `epic` once (discovery + sliced spec + one approval); each slice then runs an `epic-child` inheriting it via `track_guard`. seed.md §18.9.
- Power → a batch of related, spec-committed tickets (`workflow.json → tickets[]`, proposed by `sprint-planner`, confirmed by the human). `security` runs **once per ticket**; any BLOCKER yields the batch. Opt-in via `velocity.power_mode.enabled`; requires git.

Per-track DAGs, exceptions, and the chore `verify` skip rule: annex §5.13.

**Swarm vs solo at Phase 6.** Swarm dispatch is the **default**: the `implementation` selector takes its swarm alternate when the approved spec has ≥ `swarm.min_tasks_worth_swarming` (default 1) **independent** components **and** the project is a git repository; otherwise the solo `/tdd` chain runs. On a non-git tree the swarm phases are excepted at triage, so this resolves to solo, and a "use swarm" override SHALL be refused with the reason `swarm requires git`.

**Tracks (seed.md §18).** Track definitions live in `.claude/workflows.jsonl`. `/triage` validates each against §18.3 (I1..I11), classifies the request, confirms via `AskUserQuestion`, and materializes the chosen DAG into the TaskList. The rules above bind every Track. Migration and doctor drift-detection: annex.

## Article V — Harness orchestration (MANDATORY SOP)

`/harness` is invokable by the user and the model. A single invocation **loops through every non-gated phase boundary** until one of four exit conditions: consent gate, phase-skill failure, integrate-failure-needs-spec-change, or workflow done. You SHALL suggest `/harness` when a concrete engineering ask crystallizes; the user decides when to invoke it.

**Operational SOP lives in `.claude/skills/harness/SKILL.md`.** This Article declares the invariants that SOP must satisfy:

- You SHALL NOT self-approve at any consent gate. You SHALL NOT simulate approval. You SHALL NOT write approval tokens directly.
- Every successful phase invocation SHALL `TaskUpdate` to `completed`, append the phase to `workflow.json → completed`, and refresh marker + `harness_state` (marker FIRST) before continuing.
- `workflow.json → completed` is the durable truth across sessions; the TaskList is session-bound. When they disagree, trust `workflow.json` and re-seed.
- The `harness_continuation` Stop hook is not the driver — the loop is. Path A re-fires a loop interrupted mid-flow; Path B re-fires once the human satisfies a gate. (annex)
- On `/integrate` failure you SHALL classify: **mechanical bug** → auto-loop to `/tdd` in-place, capped at 3 retries; **needs a spec change** → EXIT LOOP with YIELD. Indicators: the SOP. You SHALL NOT relax the integrate criteria, mark a failing integrate as passed, or bypass the verify verdict.

## Article VI — Engineering rules (NON-NEGOTIABLE)

The following bind every code change.

### VI.1 No stubs — ever
- Every declared function SHALL be fully implemented with production logic.
- If the implementation is unknown, you SHALL NOT declare the function. Write the spec first.

### VI.2 Always production code
- Every line: errors handled, inputs validated, resources cleaned up.
- You SHALL NOT write `TODO`, `FIXME`, `HACK`, or `XXX` in source.
- You SHALL NOT leave commented-out code. If it is removed, it is deleted.

### VI.3 No mocks of internal code
- You SHALL NEVER mock internal project modules. If an internal dep is hard to test, the design is wrong — fix the design.
- You SHALL NEVER mock the database. Use a real test DB.
- You SHALL NEVER mock gRPC channels or stubs.
- Acceptable mock targets, exhaustively: third-party HTTP APIs that cannot run locally; system clock; OS randomness.
- Every mock SHALL carry a `# MOCK: <reason>` comment.

### VI.4 YAGNI
- **Purpose.** YAGNI exists to prevent **over-engineering, premature refactoring, and stub/scaffold code written before it is needed** — NOT to gate feature delivery. A capability the approved spec commits to is *demand*, not speculation, and SHALL be built in full, in its slice. YAGNI narrows *how* you build; it never decides *whether* you deliver spec-committed scope.
- You SHALL NOT add params, flags, or abstractions for hypothetical future use.
- You SHALL NOT refactor pre-emptively — restructure at the point a concrete third use forces it, not in anticipation of one.
- You SHALL NOT write stub, placeholder, or scaffold code ahead of a concrete need (this is the YAGNI face of VI.1 — no stubs, ever).
- Reuse libraries for what they already do.
- Abstract at the third concrete use case, not before.
- Code without a test exercising it SHALL NOT exist.
- Two-sided faithful scope: YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope. A spec AC row deferring committed scope SHALL carry `deferred: dependency|risk|cost|human-directed`; untagged or YAGNI-tagged deferral is a Critical BLOCKER at gate A (`spec-traceability-review`).

### VI.5 Current docs for third-party APIs
- For ANY third-party library, you SHALL verify its API against current documentation before writing code that uses it. You SHALL NOT recall an API from training data for external libraries.
- **Outcome mandate, not tool mandate**: satisfy it with the `context7` MCP (the shipped default in `.mcp.json`), a library's official docs / `llms.txt`, or a pinned local doc cache. A project MAY replace or remove `context7` provided the outcome holds — U6, no irreplaceable dependency (rationale: seed.md §2.5).

### VI.6 Code structure
- Every code-generation step SHALL invoke the `code-structure` skill.
- It enforces the Orchestration / Domain / Foundation layer model, consistent abstraction levels, and reuse-before-create.
- Applies to every language. Mappings ship inside the skill.

### VI.7 Read before overwrite
- Before overwriting an existing file (Write / truncating edit), you SHALL Read it in-session first. The Write tool refuses to blind-overwrite an unread file; Read-first makes the operation reliable and prevents the recurring "File has not been read yet" failure. (Partial edits via Edit already require a prior Read.)

## Article VII — Git rules

**Applicability.** This Article binds only in a git repository. On a non-git project it is vacuously satisfied: attempt no git operation; gate C and `commit` are auto-excepted at triage; the workflow ends after `/archive`.

**Branch-aware consent policy.** Two `project.json` knobs drive consent for `git commit` and `git push`: `git.protected_branches` (globs; `null` default means **every** branch is protected) and `git.branch_pattern` (regex; `null` default means no naming check). On a **protected branch**, commits require fresh `commit_consent` (`/grant-commit`, 15-min TTL) and pushes fresh `push_consent` (`/grant-push`, 5-min TTL), each gated on the user having asked for the op in their current request. Non-protected branches proceed without consent. `git_commit_guard` enforces.

**Branch topology (full rules: annex + seed.md §11).** `git.workflow_model` + `git.release_branches` declare where commits may land; `git_commit_guard` enforces on the primary tree only. **Binding precedence:** a non-`ask` model **overrides Claude's generic branching instincts and the harness default** — branch only as it prescribes; under `ask`, yield to the user.

**Detached HEAD.** When the branch resolves to the literal `HEAD`, the guard denies both commit and push; check out a named branch first, since the policy needs one to evaluate.

**Hard-blocks (regardless of consent, branch, or request).** These rewrite history, skip safety, or sweep paths; `git_commit_guard`'s `FORBIDDEN_RE` blocks them flat-out:

- `git commit --amend`; `--no-verify`, `--no-gpg-sign`, any hook/signing-skip flag.
- `git reset --hard`, `git clean -f` (any spelling), `git branch -D`, `git config`.
- `git switch --discard-changes`, `git stash drop`, `git stash clear`.
- **Worktree path-discard, any spelling** — `git checkout [<tree-ish>] -- <path>`, `git checkout .`, `git restore <path>` (`--staged` permitted: it unstages only).
- `git rebase -i`, `git add -i`; `git add -A`, `git add .` — name the paths.

Spelling table + the `git worktree remove --force` exemption: annex.

`git push` is governed by the branch-aware policy above, not `FORBIDDEN_RE`. `git push --force`/`--force-with-lease` stay forbidden unless the user names the exact op in their current request, and still need fresh `push_consent` on a protected branch.

**Autonomous feature landing (seed.md §11).** When `isAutonomousFeatureLanding()` is true (github-flow, primary tree, named feature branch neither in `git.release_branches` nor protected), `/commit` SHALL `git push -u origin <branch>` + `gh pr create --base <release>`, and SHALL yield on any push/PR/`gh`-absent failure. Fail-safe false.

## Article VIII — Hooks (the enforcement layer)

The 26 hooks in `.claude/hooks/` structurally enforce this constitution. Modifying, disabling, or bypassing one requires explicit user approval and a `seed.md` §4.1 amendment. A hook names itself when it blocks, so the constitution carries the roster and the rule; the per-hook table lives in the annex.

**By event.** Write boundary (`PreToolUse` on `Edit|Write|MultiEdit`, all wired on `NotebookEdit` too): `setup_guard`, `env_guard`, `direction_approval_guard`, `swarm_approval_guard`, `epic_approval_guard`, `verify_pass_guard`, `track_guard`, `branch_guard`, `artifact_template_guard`, `plantuml_syntax_guard`, `spec_diagram_presence_guard`, `spec_design_calls_guard`, `swarm_boundary_guard`. `tdd_order_guard` is the one true `Write`-only guard. Bash: `destructive_cmd_guard`, `gitignore_leak_guard`. Both: `git_commit_guard`, `process_lifecycle_guard`. `PostToolUse`: `lint_runner`, `test_runner`, `phase_timer`. Lifecycle: `memory_session_start` (SessionStart), `memory_stop` + `harness_continuation` (Stop), `memory_pre_compact` (PreCompact), `consent_gate_grant` (UserPromptSubmit) — the one hook outside the tool boundary, which is what makes consent unforgeable.

`git_commit_guard` also hard-blocks a closing commit whose staged `backlog.md` lacks the `source_backlog_keys` closure stamp. Per-hook events, Articles, behavior: annex §2.

## Article IX — Project memory

`.claude/memory/` accumulates project facts across sessions. You SHALL:

1. Treat the seven canonical categories (`landmarks`, `libraries`, `decisions`, `landmines`, `conventions`, `pending-questions`, `backlog`), flat or sharded, as long-term project memory. Entry schema: `.claude/memory/README.md`.
2. **Re-verify before citing.** Every skill citing an entry SHALL re-verify it (file exists, symbol still at named line, version still pinned). Failed verification → correct or delete the entry in the same run before proceeding.
3. Treat `_pending.md` as the auto-extraction inbox. Promote to canonical files only via `/memory-sync`; you SHALL NOT write canonical files directly. Mechanics + phase-skill carve-out: annex.
4. Treat `_resume.md` as the cross-session continuity snapshot — **session memory**, not project memory. Refresh cadence: annex.
5. Respect `size-cap: 500` per canonical file **in the flat shape**. Entries unverified for ≥ 30 commits or ≥ 30 days are stale. Overflow, shard-shape and decay: annex.
6. **Preserve verbatim.** Entries with `source: user-instruction` or `source: user-feedback` SHALL include a `verbatim:` blockquote of the user's actual words. The verbatim is canonical; the body is Claude's interpretation. When they conflict, **verbatim wins**, and you SHALL surface the conflict before acting on the interpretation. `/memory-sync` SHALL reject a promotion lacking a required verbatim.
7. **Respect advisory memory hooks.** Advisory PreToolUse hooks surface relevant entries before matching tool calls. You SHALL read the surfaced verbatim before executing the matched command, and treat it as binding for that operation.
8. **Durable local thread trail.** `.claude/memory/_thread.md` is a third class — **local + durable**: gitignored, and OUTSIDE `/memory-sync`'s reset path, so a shelved thread survives flushes and `/clear`. Claude Code (never the human) shelves and resumes it. Detail: annex.
9. **The central system spec is not memory.** The structural model at `docs/system/` is a reviewed spec artifact the canonical list never walks. Gated by `memory.architecture_map.enabled`.
10. **Recall before rediscovering.** Before scouting or specifying, descend by concept or walk up from the touched paths. The map routes; the code witnesses. An unwitnessed shard is never evidence.

Memory accelerates triage. It NEVER authorizes a skip.

## Article X — Multi-session coordinated workflows

Article II governs the **intra-session** axis; this governs the **inter-session** axis — up to four peer sessions over the MCP broker pool, one wearing the lead hat. Orthogonal; **Article II is unchanged**. **Opt-in, OFF by default** (`velocity.org_mode.enabled`), requires git, runs the `org` track via `org-dispatch`. You SHALL:

1. **Decide in-lane; escalate out-of-lane.** An un-decidable or cross-lane fork SHALL escalate, never be guessed (`yield_fork` task-bound, `ask_lead` free-form).
2. **Escalate to the human for human-judgment forks.** The chain is peer→lead→human (`answer_peer`).
3. **Keep gates structural.** No peer or lead path may bypass or self-satisfy a consent gate.
4. **Add no subagent.** Peers are sessions; the count stays 1 per session.

Full rule table and escalation protocol: annex §5.6.

## Article XI — Project-specific rules

Reserved for project-owner amendments. Rules below bind alongside the baseline Articles (I–X, XII) but SHALL NOT contradict them. Amending them requires an edit to `docs/init/seed.md` first (Art. I.4).

---

### XI.1 Copy register and skill overrides

`impeccable`'s "Shared design laws" absolute bans (em dashes, hero-metric template, glassmorphism, gradient text, heavy side-stripes, modal-first, identical card grids) bind **only on user-facing copy** (`site-src/**`, the docs site) — NOT internal governance, source docs, memory bodies, or code samples, where the constitutional voice uses em dashes deliberately. This scopes the bans; it does not delete them. Every other design law (color, theme, typography, motion, accessibility) stays in force wherever Claude generates UI.

**Outcome-led argument.** On user-facing copy a section headline SHALL assert what becomes true for the reader, not name a topic; mechanism follows the claim and never replaces it. Every `PRODUCT.md` anti-reference and the verifiability rule stay binding. Full scope table: annex §5.1.

---

### XI.2 Design-task routing

Every UI design task in a workflow phase SHALL route through `design-ui`, which invokes `impeccable`; `design-ui` SHALL NOT write product code. Design / development / copy are separate concerns (copy → XI.1 + `prose`). A spec whose `write_set` intersects `tdd.ui_globs` SHALL declare a `## Design calls` section whose rows each carry a Reference target and Quality criteria (`spec_design_calls_guard` and `/spec-lint` enforce); `/tdd` Step 6 invokes `Skill(design-ui, task_brief)` per row. Rule table: annex §5.2.

---

### XI.3 Entry-phase brainstorm (PM mode)

Every workflow entry phase (`/intake`, `/spec`, `/tdd`) SHALL invoke `Skill(brainstorm)` as Step 0.5 before opening its template, unless `workflow.json → skip_brainstorm` is `true` (absent → run). `/triage` Step 0 writes the flag **explicitly**. Brainstorm is **derivation-first**, writes `docs/brief/<slug>.md`, and SHALL NOT propose solutions. Runs in main context. Flag resolution, probe cap, carve-outs, and `discipline.mjs` enforcement: annex §5.3.

---

### XI.4 `/spec` codesign mode (Engineer mode)

`/spec` Step 1.5 SHALL run a codesign decision-capture flow when `workflow.json → codesign_mode` is `true` (opt-in; defaults `false`). The engineer's verbatim rationale becomes canonical when it overrides Claude, rendered into the spec's `## Decisions` section as a `>` blockquote. Never auto-set (`/triage` only *suggests*); revisit cap 3 per decision point. Full rule table: annex §5.4.

---

### XI.5 Navigation routing

For a code-navigation question ("where does X come from", "what renders Y") in any repository, `code-browser`'s language-agnostic **universal walk** (entry → imports → IO boundary) is the **first** attempt; reach for `Explore` or `grep` only when the repo has no resolvable structure or the walk dead-ends. Full-text search and definition lookups stay grep's domain. Detail: `code-browser/SKILL.md`.

---

### XI.12 Decision economy

Only **load-bearing, human's-call forks** may surface as questions or gate-A decision points. Routine engineering choices are decided in main context and RECORDED in the spec's `## Decisions` section with rationale (`owner: engineer`), reviewed at gate A rather than asked. An `AskUserQuestion` timeout adopts the recommended option as a **recorded assumption** surfaced at the next consent gate; questions never block an unattended run, consent gates still do. Category list and rule table: annex §5.12.

---

## Article XII — Skill provenance and the baseline manifest

A skill is **baseline-owned** iff its frontmatter declares `owner: baseline`. Every other skill is user/third-party and out-of-scope of baseline audit checks — absence is the deliberate default, so a project with pre-existing skills installs without annotating its files. The shipped manifest records baseline ownership (`owners.skills`) + per-file sha256 hashes; `audit-baseline` reconciles it against disk. Paths, FAIL strings, non-goals, mechanics: annex §2 + `seed.md` §17.

You SHALL:

1. **Declare baseline ownership only.** A SKILL.md shipped in the baseline SHALL declare `owner: baseline` directly after `name:`. A user/third-party skill needs no annotation. The only frontmatter FAIL is `invalid owner=<value>`; missing-`owner:` is silently skipped.
2. **Trust the manifest.** It is the canonical record of baseline-owned skills and their hashes. You SHALL NOT maintain a separate hard-coded list of baseline-skill slugs anywhere.
3. **Re-derive on drift.** A hash mismatch, or a baseline-listed slug missing from disk, is a hard FAIL — no opt-out.
4. **Preserve constitutional citation.** This Article XII SHALL remain in CLAUDE.md AND in `src/CLAUDE.template.md` (byte-equal mirror). The genesis §17 in `docs/init/seed.md` SHALL remain present, mirrored by `src/seed.template.md`. The audit verifies both.
5. **Out-of-scope skills don't break the audit.** A skill not declaring `owner: baseline` is excluded from the baseline count, names-match, and hash-drift checks.

---

## Appendix — Reference (in the annex)

Read on demand from **`.claude/CONSTITUTION.md`**: **Appendix A — Where things live** and **Appendix B — Skill index** (59 skills by category).

Quick orientation: 26 hooks, 1 subagent (`swarm-worker`), 59 skills, `.claude/commands/` (6 commands), 8 memory files, 4 MCP servers, 1 output style, `docs/init/seed.md` (genesis).
