# Per-project workflows.json so projects extend triage's task list without modifying baseline-owned skills

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The baseline ships a fixed set of workflow tracks (intake, spec, tdd, chore) whose task sequences are hardcoded inside the body of `.claude/skills/triage/SKILL.md`. A project that needs a per-project quality gate — a CLI copy review, a custom security pass, a prose-lint step before commit — has no sanctioned place to declare it. The only mechanism available today is to edit the triage skill itself.

Concrete scenario from this very session:

1. The baseline maintainer wanted a `cli-copy-review` task inserted between `/memory-flush` and `/grant-commit` whenever a workflow's anticipated diff touches `src/cli/tui/`, `src/cli/*.js`, or `bin/cli.js`.
2. The maintainer modified `.claude/skills/triage/SKILL.md` to add a "Conditional: CLI copy review" rule, self-gated on `existsSync('.claude/skills/cli-copy-review/SKILL.md')`.
3. The triage skill is `owner: baseline` and ships verbatim via `scripts/build-template.sh` Stage 1's rsync to every downstream install.
4. The `cli-copy-review` skill itself has no `owner: baseline` frontmatter, so Stage 1.5's prune pass correctly removes it from `obj/template/.claude/skills/`.
5. End-user installs receive a triage skill carrying a conditional rule that names a skill they do not have. The rule never fires for them (existsSync returns false), so it is dead code — but dead constitutional code embedded inside a baseline-owned skill they cannot edit without breaking the audit-baseline hash check.

Two deeper consequences:

- **Hidden behavior.** Downstream users have no way to discover the existsSync trick. The conditional looks like a normal rule but is silently inert.
- **No safe extension path.** A downstream project wanting to add its own pre-commit quality gate has no sanctioned mechanism. They can fork the triage skill (breaks the audit hash check) or write a per-session reminder in CLAUDE.md (Claude may comply or may not, no structural enforcement). Neither is correct.

## Goal

Per-project additions to the triage-seeded TaskList are declared in a project-owned `workflows.json` configuration file at the project root. Its schema is constitutionally defined in `docs/init/seed.md`. The triage skill reads `workflows.json` at seed time and merges declared additions into the canonical TaskList for the chosen track. Baseline-owned skills stay untouched; downstream projects extend the workflow declaratively.

## Non-goals

- **Not** allowing `workflows.json` to remove or reorder any Article-IV-mandatory phase. The constitutional phase sequence remains binding; `workflows.json` may only INSERT additional tasks at named anchors.
- **Not** allowing executable code in `workflows.json`. Conditional triggers are declarative (e.g., glob patterns, phase-completion flags). No JavaScript, no shell snippets, no eval.
- **Not** replacing `.claude/state/workflow.json` (the per-workflow runtime state). `workflows.json` is project configuration; `workflow.json` is per-workflow state. Different files, different scopes, different lifetimes.
- **Not** introducing parallel "workflow definitions" that compete with Article IV's 11-phase pipeline. The pipeline is fixed; `workflows.json` only adds insertion points between its phases.
- **Not** supporting multiple `workflows.json` files per project. One canonical location: project root.
- **Not** in scope for this workflow: replacing the rsync exclusion list in `build-template.sh` Stage 1 with a manifest-driven inclusion list (a separate, larger refactor; the Stage 1.5 prune pass is sufficient for now).

## Success metrics

- **Zero references** to per-project skills (e.g., `cli-copy-review`) inside any `owner: baseline` SKILL.md file. Measured by: `grep -rn "cli-copy-review" .claude/skills/*/SKILL.md` returns nothing after the retrofit.
- **One reference** to `cli-copy-review` inside this repo's own `workflows.json`. Measured by: grep returns exactly one task-insertion entry.
- **Audit-baseline passes** before and after the change. Measured by: `bash .claude/skills/audit-baseline/audit.sh` exits 0.
- **Zero behavior change** for a baseline install without a `workflows.json`. Measured by: a fresh `npx @friedbotstudio/create-baseline ./tmp-target` install followed by `/triage "test"` seeds exactly the canonical Article-IV task chain — same task subjects, same blockedBy edges, same `metadata.phase` values — as it does today.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer)
- **Reviewer**: Tushar Srivastava
- **Operator** (who relies on the mechanism in production): Tushar Srivastava plus every downstream project that installs the baseline once this ships. The downstream-user surface is what makes this load-bearing — a single internal mistake (mis-merged additions, badly-classified tier, malformed schema accepted silently) propagates to every install.

## Constraints

- **Article IV ordering is binding.** `workflows.json` may insert tasks at named anchors but SHALL NOT remove or reorder canonical phases. Attempted removals/reorders are rejected at parse time with a named error.
- **Declarative triggers only.** Conditional rules in `workflows.json` reference structured fields (e.g., `whenDiffTouches: ["src/cli/tui/*.js"]`, `whenPhaseCompleted: "spec"`). No executable code. The triage skill evaluates triggers against the workflow's anticipated context at seed time.
- **Tier classification: NEVER_TOUCH.** `workflows.json` is project-owned. Baseline upgrades SHALL NOT three-way-merge or overwrite it. The recursive install copies a fresh template only when the file is absent in the target tree. Classified in `scripts/build-manifest.mjs` alongside `.claude/project.json` (which is already `NEVER_TOUCH`).
- **Backward compatibility.** A project without a `workflows.json` SHALL receive the canonical Article-IV task list with no behavior change. The triage skill treats absence as "no additions"; it does not error, warn, or prompt.
- **Schema lives in `docs/init/seed.md`.** A new top-level section (next available `§N`) declares the canonical schema, the list of named anchors, the trigger DSL, and the merge semantics. Per CLAUDE.md Article I.4, this is the source of truth; the implementation must match.
- **Audit treatment.** `workflows.json` is project-owned (not `owner: baseline`). The audit-baseline check ignores it. It does not appear in `manifest.owners.skills`; the per-file hash in `manifest.files` is the only thing that travels in the shipped template (carrying the *seeded* template version, not any per-project customization).
- **Schema validation.** The triage skill validates `workflows.json` against the seed.md-declared schema on every read. Validation errors halt triage with a named error pointing to the offending entry; no silent fallback.
- **Self-hosting (dogfood).** This repo's own `workflows.json` declares the `cli-copy-review` insertion. The hardcoded conditional rule currently in `.claude/skills/triage/SKILL.md` is removed in the same commit that introduces the mechanism.

## Acceptance criteria

1. **Given** a project with a `workflows.json` declaring a `pre-commit-lint` task to be inserted after `memory-flush` (and before `grant-commit`), **when** the user runs `/triage <request>`, **then** the seeded TaskList contains `Run /pre-commit-lint for <slug>` at the declared position, with `addBlockedBy` wired to the `memory-flush` task and the `grant-commit` task's `addBlockedBy` rewired to point at the inserted task.
2. **Given** this baseline-dev repo's `workflows.json` declares the `cli-copy-review` insertion conditional on `whenDiffTouches: ["src/cli/tui/*.js", "src/cli/*.js", "bin/cli.js"]`, **when** the user runs `/triage` on a request touching `bin/cli.js`, **then** the seeded TaskList contains `Run /cli-copy-review for <slug>` between `memory-flush` and `grant-commit`.
3. **Given** a project with **no** `workflows.json` on disk, **when** the user runs `/triage <request>`, **then** the seeded TaskList is byte-identical to the canonical Article-IV task list for the chosen track — same subjects, same metadata.phase values, same blockedBy edges, same count.
4. **Given** a `workflows.json` that attempts to declare an addition removing or reordering an Article-IV phase (e.g., `removePhase: "security"`), **when** the triage skill reads it, **then** triage halts with a named error pointing to the offending entry and writes no `workflow.json` to disk.
5. **Given** a `workflows.json` whose JSON parse fails or whose contents violate the declared schema, **when** the triage skill reads it, **then** triage halts with a named error naming the schema violation and the line/path of the offending entry. No silent fallback.
6. **Given** the hardcoded conditional rule has been removed from `.claude/skills/triage/SKILL.md`, **when** `bash .claude/skills/audit-baseline/audit.sh` runs, **then** the audit exits 0 and the triage skill's shipped hash in `obj/template/.claude/manifest.json` matches its on-disk content.
7. **Given** a baseline install is upgraded via `create-baseline upgrade` to a newer version, **when** the upgrade processes `workflows.json`, **then** the existing file is preserved verbatim (NEVER_TOUCH semantics) and any local additions remain present after the upgrade.
8. **Given** a fresh install via `create-baseline <target>`, **when** the install completes, **then** `<target>/workflows.json` is present, contains the pristine seed-time template, and validates against the seed.md-declared schema.

## Post-intake expansion (2026-05-20, surfaced at the /approve-spec gate)

The original intake (sections above) frames the work as a small extension of `.claude/project.json → additions.workflow_tasks`. At the `/approve-spec` consent gate, the user surfaced a substantially larger architectural vision and chose to revise the spec in place to capture it. The user's verbatim:

> I see the structure but let us understand how the workflows (plural) work; say I as an engineer has multiple tasks to be done on the codebase. There's development ofcourse, but then there's debugging, bugfixing, quickfixing, documentation, and maintenance/chore. Not all need same workflow track. So workflows.jsonl becomes a list of tracks (a jsonl document). Each track item has id, skill to be invoked, input, invocation prompt (optional), output, output formatter prompt (optional), depends on (array of id strings), blocks (array of id strings), can execute in parallel, and a sub-track (to compose multi-skill orchestration)
>
> this is the architecture I am envisioning

The expanded scope:

- `workflows.jsonl` (line-delimited JSON, one record per *track*) becomes the canonical source of truth for workflow definitions. Each engineer-facing work kind (development / debugging / bugfix / quickfix / documentation / chore) is a first-class track.
- Each track is a DAG of nodes. Each node carries: `id`, `skill` (or `sub_track`), `input`, `invocation_prompt` (opt), `output`, `output_formatter_prompt` (opt), `depends_on[]`, `blocks[]`, `can_parallel`, `needs_user` (opt for consent gates).
- The triage skill becomes a **track selector** — classifies the request, picks the right track from `workflows.jsonl`, materializes the track's DAG into the TaskList.
- The harness skill becomes a **graph executor** — walks the DAG, runs each ready node via `Skill`, dispatches `can_parallel: true` peer clusters concurrently, yields at `needs_user: true` nodes.
- `swarm-plan` and `swarm-dispatch` fold into the graph executor — a swarm plan is a runtime-generated sub-track of `can_parallel: true` worker nodes.
- Article IV gets **amended**. The constitutional contract shifts from "11-phase pipeline is the only sanctioned path" to "`workflows.jsonl` is the source of truth for workflow definition; Article IV declares the invariants every track must satisfy (consent gates present in commit-producing tracks; track-graph acyclicity; named-skill targets that resolve)."

### Post-intake acceptance criteria (additive to AC-001…AC-008 above)

These ACs replace the implicit assumption that the 11-phase pipeline is hardcoded inside triage's body. The original ACs (AC-001…AC-008) still bind for the narrow `additions.workflow_tasks` case, which the new architecture absorbs as a degenerate "augment-the-canonical-track" use of the broader track-graph.

- **AC-009.** Given `workflows.jsonl` declares a track `tdd-quickfix` with a 4-node DAG (`scenario → implement → verify → commit`), when the user runs `/triage <request>` and the request classifies to `tdd-quickfix`, then the seeded TaskList contains exactly those 4 tasks in dependency order, with `addBlockedBy` edges matching the declared `depends_on[]`.
- **AC-010.** Given a track contains a `can_parallel: true` cluster of 3 nodes (e.g., 3 swarm-worker invocations), when the harness reaches the cluster, then all 3 nodes dispatch concurrently and the harness blocks until all 3 complete (or any one fails) before advancing.
- **AC-011.** Given a track node carries `sub_track: <sub-track-id>`, when the harness invokes that node, then the sub-track's DAG expands inline into the current track's runtime graph (TaskCreate per sub-track node, `addBlockedBy` connecting the sub-track's entry/exit nodes to the parent node's predecessors/successors).
- **AC-012.** Given a `workflows.jsonl` track that omits a consent gate Article IV declares mandatory for commit-producing tracks (e.g., `grant-commit` missing from a track that ends in `commit`), when the triage skill loads `workflows.jsonl`, then triage halts with a named error citing the Article IV invariant and the offending track id.
- **AC-013.** Given `workflows.jsonl` declares a node whose `skill` field names a skill that does not exist on disk (e.g., `cli-copy-review` in an end-user install where the skill was pruned), when triage classifies a request to that track, then triage halts with a named error citing the missing skill and the track/node ids — OR the track is rejected at install/load time, not at runtime, depending on the resolution chosen at spec time.
- **AC-014.** Given `workflows.jsonl` is malformed JSONL (a non-final line fails to parse, or a track record fails schema validation), when triage or harness reads the file, then the read halts with a named error citing the offending line number and the schema rule violated.
- **AC-015.** Given the constitutional Article IV is amended to declare `workflows.jsonl` as the source of truth, when CLAUDE.md and seed.md mirror the amended text, then audit-baseline's Article-XI mirror check passes and the constitutional language matches verbatim across both files.
- **AC-016.** Given the four currently-hardcoded triage templates (`chore`, `tdd-quickfix`, `spec-entry`, `intake-full`) have been migrated into `workflows.jsonl` as the initial track set, when `/triage` runs on an unchanged request, then the seeded TaskList is byte-equivalent to what the pre-migration triage produced for the same request — the migration is a pure refactor, not a behavior change.

The architecture is recursive (sub-tracks compose) and unifying (the current swarm-plan/swarm-dispatch pair becomes one execution mode of the graph executor rather than a parallel system). The spec covers the schema, the constitutional amendment, the triage and harness changes, the swarm fold-in, and the migration path.

### Post-spec-draft clarifications (2026-05-21, surfaced at the second /approve-spec gate)

The first spec draft (covering AC-009..016) raised 10 open questions. The user resolved each in a single batch and explicitly rejected YAGNI defaults: "yagni at this point is more technical debt for future." The spec is being re-drafted to incorporate these decisions, which materially expand the surface:

- **Alternates with preconditions (new concept).** Selector nodes inside a Track declare a list of `alternates: [{skill|sub_track, preconditions[]}]`. At runtime, the harness evaluates preconditions in declaration order and picks the first matching alternate. Concrete use case: the canonical `intake-full` track has a Phase-6 selector node whose alternates are `swarm-implementation` (preconditions: `requires_git`, `requires_min_components:3`) and `tdd-worker-chain` (preconditions: empty). The selector eliminates the need for a runtime "swarm-vs-solo decision" inside harness code; it becomes a declarative property of the Track.
- **LLM-driven track selection (replaces algorithmic substring match).** Triage's classification step is NOT a string-match algorithm. Claude reads the full workflows.jsonl manifest (every Track's `track_id`, `name`, `description`, `selector_hints`) and classifies the user's request against the available tracks using natural-language reasoning. `selector_hints` become descriptive aids for Claude, not match tokens.
- **Always confirm via `AskUserQuestion` (replaces threshold logic).** Triage's confirmation step always uses `AskUserQuestion` to present the picked track plus the top-N alternates. Confidence thresholds are not used — the user picks. This happens often (chore-vs-intake on a development task is a routine ambiguity).
- **One-shot workflow.json migrator.** When the harness encounters a workflow.json with the pre-§17 shape (`entry_phase` field present, no `track_id`), it runs a one-shot migrator transforming the old shape into the new (track_id derived from entry_phase via a canonical mapping; completed-as-phase-names mapped to completed-as-node-ids using the migrated track's node ids). The user explicitly prioritized UX for downstream developers over the simpler "refuse + restart" path.
- **New `/init-project doctor` sub-command.** A new sub-command that checks for baseline drift (workflows.jsonl validity, schema mirror integrity, missing required files, schema-version mismatch) and offers interactive fixes. Triggered manually OR surfaced by triage when workflows.jsonl is empty/missing/malformed OR run automatically by a future `create-baseline upgrade` step. Different from the existing `create-baseline doctor` (the npm CLI's manifest-drift checker).
- **`invocation_prompt` and `output_formatter_prompt` are reserved-future, declared-now.** Both fields are part of the Node schema in v1 but unused by canonical tracks. Documented as "Handlebars-style templates with LLM-driven interpolation, planned for v2." This makes the schema future-proof now; the implementation is deferred.
- **`$schema` field per Track.** Each Track record carries a `"$schema"` field pointing at a JSON Schema document that defines the Track shape. Tooling (editors, future validators) can dereference it. The schema document lives in the baseline (path TBD; likely `.claude/schemas/workflow-track.v1.json` or similar). Tracks with unknown `$schema` versions are rejected with a named error.
- **`.claude/` tooling convention.** All user-shipped baseline tooling lives under `.claude/`. Only `CLAUDE.md` and `.mcp.json` are exceptions at the project root. Documented in `conventions.md` and to be added to `seed.md §3` (Directory structure). This resolves OQ-2 universally so future "where does this file live?" questions skip.

### Post-spec-draft acceptance criteria (additive to AC-009..016)

- **AC-017.** Given a Track contains a selector node with two alternates — a swarm sub-track (preconditions: `requires_git`, `requires_min_components:3`) and a tdd sub-track (preconditions: empty) — when the harness reaches the selector node AND the project is non-git (`requires_git` fails), then the swarm alternate is skipped and the tdd sub-track expands inline into the runtime TaskList.
- **AC-018.** Given an installed target has a `workflow.json` with the pre-§17 shape (`entry_phase` set, no `track_id`, completed[] holds phase names like `"intake"`), when the user runs `/harness` after upgrading to the post-§17 baseline, then a one-shot migrator transforms the file in place — derives `track_id` from `entry_phase` via the canonical mapping (`intake` → `intake-full`, `spec` → `spec-entry`, `tdd` → `tdd-quickfix`, `chore` → `chore`), maps phase-name completions to node-id completions in the chosen track, writes the new shape — before the harness loads the workflow.
- **AC-019.** Given `.claude/workflows.jsonl` has schema/invariant violations OR is missing entirely, when the user runs `/init-project doctor`, then the doctor (a) detects each violation/absence, (b) reports each with a remediation path (regenerate from template; restore from git; fix manually), (c) on user confirmation applies the named fix, (d) re-runs the check and reports pass/fail.
- **AC-020.** Given the `.claude/` tooling convention is documented in `docs/init/seed.md §3` (Directory structure), when a downstream user invokes `/init-project doctor` against a project that has any user-shipped baseline tooling outside `.claude/` (other than `CLAUDE.md` and `.mcp.json`), then the doctor flags it as a convention violation and offers to move the file under `.claude/`.
- **AC-021.** Given triage classifies the request and presents the picked track plus alternates via `AskUserQuestion`, when the user explicitly picks the same track triage suggested, then triage proceeds without a second confirmation. When the user picks an alternate, triage uses that and proceeds. When the user picks "other" (or escapes the question), triage halts and asks for clarification.
- **AC-022.** Given a Track record carries `"$schema": "<URL>"` and the referenced schema version is unknown to the current baseline, when triage or the doctor reads the file, then it halts with a named error citing the unknown `$schema` value and the supported versions. This prevents silent schema-version skew across baseline upgrades.

## Open questions

These need a decision before `/spec` lands. Surfacing them here so `/research` and `/spec` know what to choose between.

- **Schema format.** JSON Schema (Draft 2020-12) for declarative validation in the triage skill, ad-hoc TypeScript-style declaration in seed.md prose, or hand-rolled validator with named-error reporting? JSON Schema gives free tooling; ad-hoc gives readability. `/research` to recommend.
- **Trigger DSL.** Glob-based diff triggers only (`whenDiffTouches: ["src/cli/tui/*.js"]`), or also phase-completion triggers (`whenPhaseCompleted: "spec"`), AC-label triggers (`whenAcLabel: "security-sensitive"`), or path-presence triggers (`whenFileExists: "package.json"`)? Each expands the surface; pick the minimal set the cli-copy-review retrofit needs, defer the rest.
- **Named anchors.** Which insertion points are sanctioned? Between every adjacent canonical-phase pair (10 anchors), or only at coarser-grained anchors (`before-grant-commit`, `after-document`, `after-archive`)? Finer-grained = more flexibility but more surface to maintain.
- **Conflict resolution: multiple additions at the same anchor.** If `workflows.json` declares two tasks both inserted at `before-grant-commit`, what's the order? Declaration order, alphabetical by id, or explicit `priority` field?
- **`/init-project` seeding.** Does `/init-project` write a fully-populated `workflows.json` (with the canonical Article-IV phases declared explicitly + an empty `additions` array), or a minimal stub (only `{additions: []}`)? Fuller is more discoverable; minimal is less brittle to schema evolution.
- **Validation surface.** Is schema validation a triage-skill responsibility, or does a separate `validate-workflows.json` helper script run at install time / upgrade time / on every triage? Centralizing in triage is simpler; a helper enables CI checks.
- **Error UX on validation failure.** When `workflows.json` is malformed, does triage tell the user to fix it manually, fall back to the canonical list with a loud warning, or refuse to seed any tasks until corrected? "Refuse" is safest; "fall back with warning" is more permissive.
- **Stakeholder split for future evolution.** As the mechanism generalizes to downstream users, who reviews additions to seed.md's `§N` schema (the canonical contract) versus additions to a specific project's `workflows.json` (project-internal)? Likely deferred to a governance doc, not this workflow.
