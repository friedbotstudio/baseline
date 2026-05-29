# Codebase Scout Report — brainstorm-and-codesign

Scope: new `brainstorm` skill + Step 0.5 insertion into 3 entry skills + `/spec` codesign mode + `/triage` flag parsing + `/research` auto-flag + `/archive` bundle + constitution + audit. All touchpoints are inside `.claude/`, `src/` mirrors, and the constitution files. No project-source code outside the baseline tree is affected.

## Primary touchpoints

**New skill directory (does not exist yet):**
- `.claude/skills/brainstorm/SKILL.md` — Stage 0–4 dialogue protocol; `owner: baseline` frontmatter
- `.claude/skills/brainstorm/template.md` — brief artifact skeleton (actor, trigger, current/desired, non-goals, leakage)
- `.claude/skills/brainstorm/references/interview-protocol.md` — Socratic discipline reference (parallels `design-ui/references/intent-table.md`)

**Entry-skill Step 0.5 insertions:**
- `.claude/skills/intake/SKILL.md:22-31` — Steps block; insert brainstorm gate between Step 1 (prereq) and Step 2 (read template)
- `.claude/skills/spec/SKILL.md:27-39` — Steps block; insert codesign-mode gate (read `workflow.json → codesign_mode`) at top of Step 1
- `.claude/skills/tdd/SKILL.md:22-26` — Step 1 prereq check; insert brainstorm gate immediately after (skill is "thin coordinator" so Step 0.5 fires before scenario-recipe decision)

**`/triage` flag-parsing + heuristics:**
- `.claude/skills/triage/SKILL.md:18-20` — Step 1 (restate); add flag-parse pre-step
- `.claude/skills/triage/SKILL.md:23-36` — Step 4 (write `workflow.json`); add `skip_brainstorm` + `codesign_mode` fields to the schema block
- `.claude/skills/triage/SKILL.md:41-59` — Step 5 (seed tasklist); orthogonal to the new fields — no change
- `.claude/skills/triage/seed-tasklist.mjs` — DAG materializer (does not need new fields; brainstorm/codesign fire inside the entry skill, not at DAG level)

**`/research` auto-flag suggestion:**
- `.claude/skills/research/SKILL.md:30-38` — Method; add Step 5 "if no candidate dominates, recommend `codesign_mode: true` in the memo"
- `.claude/skills/research/SKILL.md:44-62` — output Format block; add `## Codesign recommendation` section (advisory, not binding)

**`/archive` bundle extension:**
- `.claude/skills/archive/SKILL.md:24-37` — table of source/target pairs; add `docs/brief/<slug>.md → brief.md`
- `.claude/skills/archive/archive.sh:54-63` — `PAIRS` array (executable list); add `"docs/brief/$SLUG.md brief.md"` row before the spec_approvals row

**Audit:**
- `.claude/skills/audit-baseline/audit.mjs:79-94` — `EXPECTED_HOOKS`/`EXPECTED_AGENTS`/`EXPECTED_COMMANDS`/`EXPECTED_MEMORY_FILES` declared inline; **`EXPECTED_SKILLS` is NOT hardcoded** (removed per Article XI:271) — skill enumeration is read from `manifest.owners.skills` at audit time. Adding the brainstorm skill with `owner: baseline` is sufficient; the audit auto-picks it up after the next `scripts/build-manifest.mjs` run.

**Constitution:**
- `CLAUDE.md:51-94` — Article IV phase table + rules; add footnote on rows 1, 4, 6 referencing brainstorm Step 0.5 / codesign mode (no new phase rows)
- `CLAUDE.md:85-94` — Entry points subsection; mention `--no-brainstorm` and `--codesign` flag support
- `CLAUDE.md:220-267` — Article X (X.1, X.2 currently); insert new X.3 (Entry-phase brainstorm — PM mode) and X.4 (`/spec` codesign mode — Engineer mode) between X.2 and Article XI
- `CLAUDE.md:269-281` — Article XI: untouched (skill provenance is auto-derived; brainstorm gains `owner: baseline` and is picked up)
- `CLAUDE.md:285-299` — Appendix A: change `.claude/skills/` count `39` → `40`; the category breakdown line needs a new "Phase helpers (1)" entry
- `CLAUDE.md:301-338` — Appendix B: add new section "**Phase helpers (1)**: `brainstorm` — Stage 0.5 brainstorm dialogue invoked by `/intake`, `/spec`, `/tdd` entries"

**Genesis (seed.md §16/17/18):**
- `docs/init/seed.md:14` — header sentence enumerates "thirty-nine skills"; bump to 40
- `docs/init/seed.md:99-127` — §3 directory structure has `# 39 skills: ...` comment in tree; update and add "phase helpers (1)"
- `docs/init/seed.md:307-342` — §5 11-phase workflow; mirror the Article IV footnote additions
- `docs/init/seed.md:567-580` — §15 (recommender invocation) is unaffected
- `docs/init/seed.md:581-671` — §16 project-specific configuration; no schema additions land here (workflow.json schema lives elsewhere)
- `docs/init/seed.md:672-683` — §17 skill provenance: untouched (auto-derived)
- `docs/init/seed.md:684-755+` — §18.2 Track schema is unaffected (brainstorm/codesign fire inside entry skills, not as DAG nodes); §18.3 invariants I1..I11 untouched

**Template byte-mirrors (Article XI.4 binds these):**
- `src/CLAUDE.template.md` (337 lines, mirrors CLAUDE.md byte-for-byte) — all CLAUDE.md edits replicate here
- `src/seed.template.md` (748 lines, mirrors docs/init/seed.md byte-for-byte) — all seed.md edits replicate here

**`workflow.json` schema:**
- `.claude/state/workflow.json` is the runtime instance; no schema file in tree (it is a flat JSON object documented in `triage/SKILL.md:24-36`)
- `.claude/schemas/workflow-track.v1.json` — `NEVER_TOUCH`; declares Track shape (not workflow-instance shape). Untouched.
- `src/.claude/workflows.template.jsonl` — pristine 7-track set overlaid by `scripts/build-template.sh` Stage 2. Untouched (new fields fire inside entry skills, not at Track level).
- Default-on-missing: entry skills SHALL read `workflow.json → skip_brainstorm ?? false` and `?? codesign_mode ?? false` — no migrator needed for in-flight workflows.

## Entry points that reach this code

- `Skill(harness)` — `.claude/skills/harness/SKILL.md` loop body picks the next pending task (`intake` / `spec` / `tdd`) and invokes `Skill(<phase>)`. Brainstorm fires inside the invoked skill at its Step 0.5.
- `Skill(triage)` — `.claude/skills/triage/SKILL.md`; user invokes via `/triage "<request>"` slash command (no slash-command body file in `.claude/commands/`; the slash command resolves directly to the skill).
- Direct user invocations: `/intake`, `/spec`, `/tdd`, `/research`, `/archive` — each is a slash-resolved skill call; each Step 0.5 reads `workflow.json` so the fire-or-skip decision is deterministic regardless of entry path.
- `Skill(harness)`'s integrate-failure decision tree (Article V; `harness/SKILL.md`) — owns the re-entry path for codesign mode when `/integrate` exits with "needs spec change".

## Existing tests

- `tests/audit-baseline-post-amendment.test.mjs` — covers audit after constitutional amendments; needs an update to assert the new skill count (40) is picked up via the manifest, NOT via a hardcoded list (per Article XI). New test rows for brainstorm `owner: baseline` declaration.
- `tests/spec-shippability-review.test.mjs` — covers dev-only review of baseline-shipped SKILLs; will scan the new brainstorm SKILL.md automatically (the aggregate scanner walks `owner: baseline` skill dirs). Add a positive-case fixture confirming the new SKILL.md passes shippability (no `src/`/`tests/`/`scripts/` path leaks).
- `tests/tdd-step-6.test.mjs` — covers `/tdd` worker-chain seeding; Step 0.5 insertion is upstream of the worker chain so the existing test surface is unaffected. New test for the Step 0.5 brainstorm-gate insertion (read `workflow.json`, conditionally invoke).
- `tests/workflow-migrator.test.mjs` — covers pre-§18 `entry_phase` → `track_id` migration in `src/cli/workflow-migrator.js`. New fields default-on-missing; the migrator does not need to set them. Add a test asserting migrator output omits `skip_brainstorm`/`codesign_mode` (they materialize at read time, not migration time).
- `tests/workflows-validator-invariants.test.mjs` + `tests/workflows-validator-predicates.test.mjs` + `tests/workflows-validator.test.mjs` — exercise I1..I11. Untouched (new fields are workflow-instance, not Track-schema).
- New tests required (per intake AC):
  - `tests/brainstorm-dialogue-discipline.test.mjs` — assert Stage 1 dialogue transcript contains no solution-shaped tokens (AC #3)
  - `tests/brainstorm-skip-fast-path.test.mjs` — assert `skip_brainstorm: true` short-circuits before any AskUserQuestion (AC #2)
  - `tests/spec-codesign-mode.test.mjs` — assert codesign mode produces `## Decisions` section with engineer verbatim blockquote (AC #6)
  - `tests/codesign-reentry.test.mjs` — assert integrate-failure → re-entry path with 3-revisit cap (AC #7)
  - `tests/workflow-json-defaults.test.mjs` — assert missing fields default false without erroring (AC #8)

## Constraints and co-changes

- **Article II (decisions in main context).** Brainstorm and codesign dialogues run in main context; no subagent delegation. The `Skill(brainstorm)` invocation is a main-context skill call, not an `Agent` Task.
- **Article XI.4 byte-mirror.** `src/CLAUDE.template.md` and `src/seed.template.md` MUST update in the same diff as `CLAUDE.md` and `docs/init/seed.md`. The audit (`audit-baseline/audit.mjs`) verifies the mirror invariant; mismatches surface as FAIL.
- **`artifact_template_guard.mjs:35-38`** watches only `docs/{intake,brd,specs,rca}/*.md`. The new `docs/brief/<slug>.md` is **NOT** in the guard's watched set — the brainstorm skill is responsible for writing valid briefs without guard enforcement. Decision needed at `/spec`: do we extend the guard to cover `docs/brief/*.md`, or leave it un-guarded as an internal artifact?
- **`src/project.template.json:109-145`** declares `artifacts.required_sections.{intake,brd,spec,rca}`. If we extend the guard above, we add `brief: [...]` here too.
- **`scripts/build-manifest.mjs`** auto-picks up `owner: baseline` SKILL.md files; no edit needed. The shipped `obj/template/.claude/manifest.json` regenerates and `owners.skills.brainstorm: "baseline"` appears automatically on next build.
- **`scripts/build-template.sh` Stage 0b** syncs `src/cli/workflow-migrator.js` → `.claude/skills/harness/workflow-migrator.js`. Untouched (no migrator changes needed).
- **`workflows.jsonl` is NEVER_TOUCH** (per seed.md §18.1). The new fields fire inside entry skills, NOT as Track nodes — workflows.jsonl is untouched.
- **`spec_design_calls_guard`** (already in CLAUDE.md Article VIII as the X.2 enforcer) is parallel-pattern to what a future "codesign_decisions_guard" could be. Decision deferred to spec.
- **Audit count** (CLAUDE.md Appendix A line "39 skills" + seed.md §0/§3 mentions) needs lockstep updates. The audit itself does NOT count manually — it reads from manifest. The CLAUDE.md/seed.md numbers are documentation only.

## Patterns in use here

- **Skill staging.** `design-ui/SKILL.md:42-78` exemplifies the "Stage 0 classify → Stage 1 capture → Stage 2 act → Stage 3 confirm → Stage 4 persist" pattern. Brainstorm SHOULD adopt the same staging vocabulary so the design-ui Open Question (whether to reuse design-ui Stage 0) is decidable in `/research`.
- **Terminal states.** `design-ui/SKILL.md:54-77` returns structured terminal-state objects (`final_state: "not_a_design_task" | "mixed_brief" | "needs_human"`) for misroute / cap / human-required. Brainstorm SHOULD adopt the same terminal-state shape so callers (entry skills) can branch deterministically.
- **AskUserQuestion + verbatim capture.** No existing skill captures engineer verbatim into a structured doc section yet. The closest precedent is `/triage`'s confirmation flow (`triage/SKILL.md:50-52`) — single-question multi-option. Codesign mode adds free-form turn capture; new pattern.
- **State files at `.claude/state/<skill>/<slug>.json`.** `/tdd` (`.claude/state/tdd/<slug>.json`), `/design-ui` (`.claude/state/design/<slug>.json`), `/swarm-plan` (`.claude/state/swarm/<slug>.json`) all use this convention. Brainstorm SHOULD use `.claude/state/brainstorm/<slug>.json` for in-flight dialogue state during Stage 2, then publish `docs/brief/<slug>.md` at Stage 4.
- **Marker-then-state ordering.** The harness skill (`harness/SKILL.md`) writes `.claude/state/.harness_active` marker FIRST, then `harness_state` JSON. Brainstorm's state file does NOT need this pattern (no Stop-hook consumer).
- **`owner: baseline` frontmatter.** Standard for shipped skills. Brainstorm SKILL.md MUST declare it (positioned directly after `name:`, per Article XI.1).

## Risks / landmines

- **Dogfood gap.** This workflow's own `/intake` ran at task #1 using the **pre-feature** intake skill. The brainstorm helper cannot yet be used on the very feature that introduces it. Surfaced in the intake doc; not blocking, but reviewers re-reading the intake post-ship will notice the missing brief.
- **artifact_template_guard scope decision.** Listed under Constraints. Default-leave-unguarded keeps the surface smaller; default-extend-guard adds parallel symmetry with intake/spec. The spec must decide.
- **In-flight workflows on disk.** Any `.claude/state/workflow.json` written before this feature ships lacks the new fields. Entry-skill reads default to `false`, but the harness preflight migrator (`src/cli/workflow-migrator.js`, mirrored to `.claude/skills/harness/workflow-migrator.js`) only handles pre-§18 → §18 shape migration (`entry_phase` → `track_id`). The new fields are read-time defaults, not migration-time additions — verify in spec.
- **Codesign re-entry mechanics.** `Skill(harness)`'s integrate-failure decision tree (Article V) currently exits to user with `reason: "integrate failed: needs spec change"`. Re-entering `/spec` in codesign mode after user-`/harness` requires harness to pass `codesign_mode: true` and the integrate-failure context to `/spec` — currently no parameter-passing mechanism between harness ticks beyond `workflow.json`. The spec must address this (proposed: write a `codesign_revisit_context.json` state file before yielding).
- **Triage UX inflation.** Adding `--no-brainstorm` / `--codesign` flag parsing + heuristic detection + `AskUserQuestion` confirms inflates `/triage`'s already-long Step 5 procedure. Risk: `/triage` becomes the slowest entry point. Mitigation: collapse to a single `AskUserQuestion` covering both flags when triage detects either trigger.
- **Stop-hook resume after codesign yield.** The `harness_continuation` Stop hook Path B (CLAUDE.md Article VIII) auto-resumes after consent-gate tokens are written. Codesign-mode yields are NOT consent gates (no token); the Stop hook stays silent and the user must re-invoke `/harness`. Documented behavior; ensure spec explicitly notes the re-invocation requirement.
- **Skill count drift between CLAUDE.md Appendix A, seed.md §0/§3, and the auto-derived manifest.** Three sources of truth for the "39" number today; the audit (per Article XI) does NOT enforce equality with the text. Doc-only drift is silent. Workflow's `/document` phase or the `audit-baseline` skill may need a follow-up tightening (out of scope here).
- **`docs/brief/` directory creation.** The brainstorm skill creates the directory lazily (per seed.md §3 "Lazy creation"). No co-change needed in directory templates.
