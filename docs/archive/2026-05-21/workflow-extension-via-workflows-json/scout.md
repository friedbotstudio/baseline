# Codebase Scout Report — workflow-extension-via-workflows-json

Scope: every file that reads/writes the triage-seeded TaskList, every file that defines or consumes the project's extension surface (`additions`), every file that classifies templates for the upgrade flow, and every file that ships verbatim to downstream installs.

## Primary touchpoints

- `.claude/skills/triage/SKILL.md` — verbatim instructions Claude follows to seed the TaskList. Step 5 holds the canonical templates for each track (intake / spec / tdd / chore). The hardcoded `cli-copy-review` conditional currently lives at the end of Step 5 (added earlier this session; the very rule we're retrofitting). Owner: `baseline`. Ships verbatim via `scripts/build-template.sh` Stage 1 rsync.
- `docs/init/seed.md` — `## §4` enumerates baseline components; `## §13` is the rebuild protocol; `## §16` is the project-specific configuration addendum populated by `/init-project`. New schema for the workflow-extension mechanism needs a new top-level `## §N` declaring its shape, the named insertion anchors, the trigger DSL, and the merge semantics. Per Article I.4, this is the source of truth.
- `src/seed.template.md` — pristine ship-time mirror of `seed.md`, copied into `obj/template/docs/init/seed.md` by `scripts/build-template.sh:97`. Schema changes land in both files (byte-equal mirror per Article XI).
- `.claude/commands/init-project.md` — Step 6 ("Apply") writes `.claude/project.json` with `configured: true` and a populated `additions` block. New sub-step needs to seed the workflow-extension config (file location TBD: separate `workflows.json` vs extending `project.json → additions`).
- `.claude/project.json:220-226` — current `additions` block exists with fields `agents`, `skills`, `hooks`, `mcp_servers`, `swarm_worker_skills`. **This is established prior art for project-owned extensions.** The mechanism may live here as `additions.workflow_tasks` (or similar) rather than introducing a second file.
- `src/project.template.json` — ship-time pristine project.json. If we extend `additions`, the template needs the new empty array.
- `src/cli/install.js:13-14` — `NEVER_TOUCH = ['.claude/project.json']` and `SPECIAL_MERGE = ['.mcp.json']`. If the extension lives in a new `workflows.json`, add it here. If it lives inside `project.json → additions`, no change needed (project.json is already NEVER_TOUCH).
- `scripts/build-manifest.mjs:16-17` — `NEVER_TOUCH_PATHS` and `SPECIAL_MERGE_PATHS`. Mirror of the install.js constants; same change required iff a new file is introduced.
- `.claude/skills/audit-baseline/audit.sh:126-138` — reads `additions` from project.json (`add_agents`, `add_skills`, `add_hooks`, `add_mcp_servers`, `add_swarm_worker_skills`). The audit-baseline check unions these with the baseline `EXPECTED_*` sets. New extension key (if added under project.json's `additions`) needs the same union treatment so audit-baseline stays accurate.

Out of scope but worth noting for `/research`:

- `.claude/project.json:93-123` already declares a `workflow` block with `phases`, `optional_phases`, and `artifacts`. This is a static enumeration of the Article-IV pipeline. It is NOT the dynamic task-seeding logic. Touching this block is a non-goal per the intake.
- `.claude/skills/harness/SKILL.md` re-seeds the TaskList from `workflow.json → completed + exceptions + entry_phase` using the canonical templates from triage's SKILL.md (line 70). The re-seed logic mirrors triage's Step 5. If we move the templates into config, both consumers (triage at first invocation, harness on re-seed) need the same source.

## Entry points that reach this code

- `/triage <slug>` (user-typed slash command) — `.claude/commands/` has no `triage.md`; this is a Skill invocation pattern. The user types `/triage`, which resolves to `Skill(triage)`. Triage SKILL.md is the canonical entry; everything starts there.
- `/init-project` (user-typed; `.claude/commands/init-project.md` declares `disable-model-invocation: true` — structurally user-only) — bootstrap-time entry; populates project.json and the §16 addendum. If new mechanism reuses project.json `additions`, init-project is where it's seeded.
- `Skill(harness)` (model + user invokable) — re-seeds the TaskList from `workflow.json` durable state on resume (`harness/SKILL.md:69-70`). Uses the same canonical templates as triage.
- `.claude/hooks/track_guard.sh:27` — reads `.claude/state/workflow.json` (per-workflow runtime state, NOT the config file). Enforces Article-IV phase ordering at the Write boundary. Does NOT consume any per-project workflow config currently; would need to learn about additions iff the additions can defer / re-order phases (they can't per the intake's non-goals, so no change here).
- `.claude/hooks/memory_stop.sh:284` — reads workflow.json (runtime state) for `_resume.md` snapshot generation. No change.

## Existing tests

- `tests/manifest.test.mjs` — manifest version, structure, hash determinism. Need new test: `workflows.json` (or `additions.workflow_tasks`) present in manifest with correct tier classification (NEVER_TOUCH if separate file).
- `tests/install.test.mjs` — install copies template files into target. Need new test: a fresh install creates the workflow-extension config (template path) and an upgrade preserves any local additions (NEVER_TOUCH).
- `tests/build-audit-gate.test.mjs` — audit passes after build. Need new test: project.json with `additions.workflow_tasks` populated passes audit-baseline.
- `tests/skill-ownership.test.mjs` — owner classification. No change anticipated unless we add new baseline-owned skill (probably not — this is a config change, not a new skill).
- `tests/release-workflow.test.mjs` — workflow ordering. Need new test: workflows.json (or additions.workflow_tasks) inserts tasks at the declared anchor; canonical task list is byte-identical without the additions.
- `tests/harness_continuation.test.mjs` — Stop-hook safety net. No change.
- **No existing tests for the triage skill itself.** `ls tests/triage*` returns nothing. New test coverage for triage's seed-time merge logic is greenfield.

## Constraints and co-changes

- **Article I.4 mirror rule.** `docs/init/seed.md` and `src/seed.template.md` are byte-equal. Any schema added to one lands in both in the same commit. The same rule binds `CLAUDE.md` and `src/CLAUDE.template.md`.
- **Article XI hash check.** `audit-baseline.sh` verifies hashes of every `owner: baseline` skill against `obj/template/.claude/manifest.json`. If we end up modifying any baseline-owned SKILL.md (very likely: triage at minimum), the build needs to rebuild the manifest before audit runs. Stage 4 of `build-template.sh` already handles this ordering.
- **`/init-project` idempotency contract (init-project.md Step 7).** Re-runs of `/init-project` replace §16 wholesale; manual notes belong in sibling sections. The new workflow-extension seed must follow the same contract: re-runs leave a populated `workflows.json` (or `additions.workflow_tasks`) untouched, OR the user explicitly opts into a re-seed. Most safely: re-runs do NOT touch the additions block once a project's set it; only the FIRST run populates with the default empty shape.
- **NEVER_TOUCH semantics on upgrade.** Per `src/cli/merge.js:67-74`, NEVER_TOUCH paths present in the target are preserved (`NEVER_TOUCH_PRESERVE`); absent ones get the template content (`NEVER_TOUCH_ADD`). This is the correct upgrade behavior for a user-customized config. If the mechanism lives inside `project.json → additions`, no new NEVER_TOUCH wiring is needed.
- **Settings and hook wiring.** `.claude/settings.json` wires the 22 baseline hooks. None of them currently read workflows.json or project.json's additions block beyond what audit-baseline.sh does. No new hook is needed for this work.
- **Recommender JSON shape (init-project Step 4).** The `claude-automation-recommender` emits `{stack, project_json, additions, gaps}` with `additions` having `mcp_servers`, `skills`, `hooks`, `swarm_worker_skills`. If we extend the additions concept, the recommender's `additions` shape may need to grow (or we accept that workflow_tasks additions are not auto-recommended — they're declared manually by the user).

## Patterns in use here

- **Project-owned configuration extends baseline-owned skills via declared fields.** The established pattern is: baseline-owned skill reads `.claude/project.json → <key>` at runtime. Examples: `design-ui` reads `tdd.ui_globs` (per CLAUDE.md Article X.2), `triage` reads `git.protected_branches`, `audit-baseline.sh` reads `additions.*`. The skill body declares the contract; the project file populates the values. New mechanism follows this pattern.
- **Skill task-seeding is verbatim instructions, not code.** Triage's Step 5 is a markdown body Claude follows directly. The "merge per-project additions into the canonical list" logic will be expressed as instructions (or a helper script the skill body invokes, similar to `spec-render`'s `render.sh`).
- **Templates ship pristine via `src/*.template.*`.** Files that need a known initial value for fresh installs (CLAUDE.md, seed.md, project.json, .mcp.json, settings.json) have pristine `src/*.template.*` copies overlaid by build-template.sh Stage 2. If a new file is introduced, it follows the same pattern.
- **Schemas live in seed.md.** Per Article I.4 precedence, seed.md is the source of truth. Schema for any new declarative format (workflows.json shape, additions field shape) is declared in a numbered `§N` section.

## Risks / landmines

- **Naming collision: `workflow.json` vs `workflows.json`.** `.claude/state/workflow.json` is the per-workflow runtime state (slug, entry_phase, completed, exceptions). The user's proposed `workflows.json` (with 's', at project root) is project config. Off-by-one-letter; high collision risk for both maintainers and readers. `/research` should propose a clearer name — `pipeline-additions.json`, `workflow-extensions.json`, or skipping the new file entirely and using `project.json → additions.workflow_tasks`.
- **Two parallel extension surfaces.** project.json already has an `additions` block for artifact-level extensions (agents/skills/hooks/MCP/swarm_worker_skills). Introducing a second config file for workflow-task extensions splits the extension surface — users now have two places to look. Strong case for keeping everything under `project.json → additions`.
- **Triage skill mid-flight modification.** This very workflow will modify `.claude/skills/triage/SKILL.md` to (a) remove the hardcoded cli-copy-review conditional and (b) add the workflows.json read+merge logic. Implementation phase runs through the triage skill itself; the changes affect the next session, not the current one. No bootstrapping problem in practice — we're inside the harness for THIS workflow which already has its tasks seeded — but worth flagging.
- **`additions.workflow_tasks` audit semantics.** If we extend `additions`, audit-baseline.sh's union-with-baseline check (`add_agents + EXPECTED_AGENTS` style) needs an analog. But workflow_tasks aren't baseline-owned artifacts; they're just declarative task insertions. The audit treatment for this new key is closer to "ignore" than "union" — it doesn't claim component-level ownership. Detail for the spec.
- **Conditional trigger evaluation.** The intake's `whenDiffTouches: ["src/cli/tui/*.js"]` example implies triage knows the "anticipated diff." At triage time the diff hasn't happened. Two options: (a) triggers evaluate at triage time against the user's natural-language request (fragile); (b) the inserted task is seeded unconditionally and the task itself self-skips at run time based on the actual staged diff (cleaner). `/research` should pick.
- **Recommender output schema is stale.** init-project.md Step 4 declares the recommender JSON shape; that shape may need to grow to recommend workflow_tasks additions. Or we accept that workflow_tasks additions are user-declared only (not auto-recommended), at least initially.

Scout complete. The biggest open architectural choice — whether to introduce a second file (`workflows.json`) or extend `.claude/project.json → additions` — is a research question, not a scout question, and is the single most important call `/research` makes for this workflow.
