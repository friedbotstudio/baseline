# Pattern Research — workflow-extension-via-workflows-json

The mechanism's surface is configuration + skill-body instructions + (optionally) a tiny helper script invoked from the triage skill. There are **no third-party library APIs** in play — no `ajv`/`zod`/`jsonschema` runtime, no `jq`, no parser dependency. Validation can be expressed inline as instructions Claude follows (matching every other "skill reads structured config" pattern in this codebase: `design-ui` reads `tdd.ui_globs` from project.json, `triage` reads `git.protected_branches`, `audit-baseline.sh` reads `additions.*`). So context7 is not relevant for this research memo.

The architectural question is not "which library" — it's "where does the project-owned config live, and how does the triage skill consume it." Two real candidates, plus a third weaker option for completeness.

---

## Candidate A: Extend `.claude/project.json → additions.workflow_tasks`

- **Summary**: Reuse the existing `additions` block in `.claude/project.json`. Add a new `workflow_tasks` field that holds an array of `{ anchor, task, ... }` entries declaring per-project task insertions. No new file at the project root, no new tier classification, no new audit wiring.
- **API references (current)**: N/A — no third-party API; this candidate uses the existing project.json shape declared in `docs/init/seed.md` §13 and consumed by `.claude/skills/audit-baseline/audit.sh:126-138`.
- **Fits**: **Yes.** The scout report explicitly names project.json's `additions` block as "established prior art for project-owned extensions." Existing fields (`agents`, `skills`, `hooks`, `mcp_servers`, `swarm_worker_skills`) all follow the same `additions.<kind>: <array>` shape. The audit reads them via a uniform pattern. Adding `workflow_tasks` extends that pattern without inventing a new surface.
- **Tests it enables**:
  - Triage reads project.json, finds `additions.workflow_tasks`, inserts the declared tasks at the declared anchor.
  - Triage with an empty (or absent) `workflow_tasks` array seeds the canonical task list unchanged.
  - Audit-baseline ignores entries in `workflow_tasks` (they're not baseline components — no union with `EXPECTED_*` sets).
  - Upgrade preserves user's `additions.workflow_tasks` entries verbatim (project.json is already NEVER_TOUCH).
- **Tradeoffs**:
  - **Pro**: One config file, one place to look. Zero new tier classification, zero new install/upgrade wiring. The recommender's existing output shape (`{additions: {...}}`) can grow naturally to include workflow_tasks recommendations if we ever want auto-suggestions.
  - **Pro**: project.json is `NEVER_TOUCH` per install.js:13 and build-manifest.mjs:16. Upgrade-safety is free.
  - **Con**: project.json grows in scope. It started as "test/lint/destructive/swarm config" and now covers "extensions of every baseline-owned surface." Cognitive load increases as more types of additions land. A reader skimming project.json sees 200+ lines covering many concerns.
  - **Con**: Versioning the workflow_tasks schema is intertwined with versioning project.json. If we ever need a major schema break for workflow_tasks alone, we cannot bump in isolation.
  - **Con**: There is no current `$schema_version` per-block; the file has one top-level `$schema_version: 1`. Evolution semantics for a new sub-key need to be decided (most safely: additive only).

---

## Candidate B: New `workflows.json` at the project root

- **Summary**: A new top-level file `workflows.json` (or a more disambiguating name) at the project root, declaring per-project task insertions. Lives outside `.claude/`. Tier-classified as `NEVER_TOUCH` in both `src/cli/install.js` and `scripts/build-manifest.mjs`. Has its own pristine template at `src/workflows.template.json`, overlaid by `build-template.sh` Stage 2. Seeded by `/init-project` Step 6. The schema is declared in a new `## §N` in `docs/init/seed.md`.
- **API references (current)**: N/A — same as Candidate A.
- **Fits**: **Partial.** The pattern "project root file, NEVER_TOUCH, pristine template overlay, baseline-owned skill reads it" already exists for `.mcp.json` (SPECIAL_MERGE, not NEVER_TOUCH) and `CLAUDE.md`/`seed.md`/`.claude/project.json`/`.claude/settings.json` (each with their own tier classification). Adding another fits structurally, but the scout report flags this as splitting the extension surface: project.json already holds extension config; introducing a second file fragments where users go to extend baseline behavior.
- **Tests it enables**:
  - Fresh install creates `workflows.json` from template.
  - Upgrade preserves user-modified `workflows.json` (NEVER_TOUCH semantics).
  - Triage reads `workflows.json`, validates against schema, merges into canonical task list.
  - Absent `workflows.json` (e.g., projects that pre-date the change) → triage falls back to canonical list with zero behavior change.
  - Audit-baseline ignores the file (not `owner: baseline`).
- **Tradeoffs**:
  - **Pro**: Clean separation of concerns. project.json holds engineering config; workflows.json holds workflow extensions. A reader looking for "how does this project extend the workflow" has one obvious file.
  - **Pro**: Versioning workflows.json independently is easy — it has its own top-level shape. A schema break only touches this file.
  - **Con**: **Naming collision** with `.claude/state/workflow.json` (the per-workflow runtime state). The scout report flagged this explicitly. Off-by-one-letter (`workflow` vs `workflows`); two files at near-adjacent paths; high confusion risk for downstream maintainers reading code that references either. Alternative names — `pipeline-additions.json`, `workflow-extensions.json` — clarify the role but ship vocabulary that doesn't appear elsewhere in the baseline.
  - **Con**: Two new tier classifications (one in install.js, one in build-manifest.mjs). Two new audit-baseline checks (file present after install, file's hash in manifest). Two new template overlays in build-template.sh.
  - **Con**: Splits the extension surface. Users now have two files (project.json for `additions.*`, workflows.json for workflow tasks). Cognitive load increases differently — fewer concerns per file, but more files.

---

## Candidate C: `.claude/workflow-extensions/` directory, one file per extension

- **Summary**: A new directory `.claude/workflow-extensions/` containing one JSON file per extension (e.g., `cli-copy-review.json`, `pre-commit-lint.json`). Triage globs the directory at seed time, reads each file, merges every declared task into the canonical list. NEVER_TOUCH at directory level. Each extension is independently discoverable, addable, removable.
- **API references (current)**: N/A.
- **Fits**: **Weak.** No existing baseline file uses this directory-of-fragments pattern. `.claude/skills/` is the closest analog (one dir per skill), but skills are first-class baseline components with strict ownership semantics. Workflow extensions are user-declared customizations; the per-extension-file pattern adds composition complexity without a clear payoff over Candidate A's array shape.
- **Tests it enables**: Same surface as A/B plus per-file independence (adding/removing a single extension is a file operation, not a JSON edit).
- **Tradeoffs**:
  - **Pro**: Each extension is independently discoverable. `ls .claude/workflow-extensions/` shows the active set without parsing JSON.
  - **Pro**: Adding/removing extensions doesn't risk JSON merge conflicts the way editing a shared array might.
  - **Con**: More surface. New directory in install.js + build-manifest.mjs (presumably as a NEVER_TOUCH glob, which isn't a pattern the current code supports — both modules use exact-path NEVER_TOUCH lists). Would require generalizing the NEVER_TOUCH model.
  - **Con**: No prior art in the codebase. Every other "user-declared config" lives in a single file with a known schema. Inventing a directory pattern for one feature is YAGNI per seed.md §2.4.
  - **Con**: Audit-baseline's check for "is this file owned by the baseline?" gets harder. Currently the audit walks a known set of owner-tagged files; a glob-based directory makes the check less crisp.

---

## Recommendation

**Candidate A.** Extend `.claude/project.json → additions.workflow_tasks`.

The case is straightforward: A reuses an established pattern, requires zero new tier classifications, zero new install/upgrade wiring, zero new audit surface. The scout report's strongest landmine — naming collision between `workflow.json` (runtime state) and `workflows.json` (config) — is sidestepped entirely. The audit-baseline pattern that already reads `additions.*` extends to read `additions.workflow_tasks` with one new branch in the union logic (or simply ignores it, since workflow_tasks aren't claim-of-ownership).

Concretely: the `workflow_tasks` array holds entries of the shape

```json
{
  "id": "cli-copy-review",
  "anchor": "before:grant-commit",
  "subject": "Run /cli-copy-review for <slug>",
  "activeForm": "Reviewing CLI copy",
  "description": "Surfaces user-facing CLI copy regressions before commit consent.",
  "metadata": { "phase": "cli-copy-review" }
}
```

The `anchor` field uses a small declared vocabulary (`before:<phase>`, `after:<phase>`) restricted to Article-IV-mandatory phase names. Anchors that name a phase not in the canonical pipeline are rejected at parse time with a named error. The intake's "remove or reorder" non-goal is enforced at this layer: anchors only INSERT, never REMOVE or REORDER.

On the trigger question (the intake's open question 2): **defer triggers to the task skill itself.** Every `workflow_tasks` entry is unconditional from triage's perspective; the cli-copy-review skill (and any future trigger-bearing user skill) checks the diff at runtime and exits CLEAN trivially when no relevant files changed. This:
- Removes the need for any trigger DSL in the schema.
- Removes the "anticipated diff at seed time" guesswork.
- Matches the existing pattern where phase skills decide their own no-op conditions (e.g., `security` is optional, `chore`'s simplify/integrate/document are conditionally invoked from within the skill).

**What would flip the decision toward B:**
1. The team decides workflow extensions are conceptually distinct from engineering config and deserve their own file regardless of cost. This is a values call, not a technical one.
2. A future need for per-project triggers more expressive than "task self-skips" — e.g., schema-level `whenAcLabel`/`whenFileExists` DSL with formal validation. A standalone file gives that schema room to grow without bloating project.json.
3. Tooling outside Claude needs to query workflow extensions specifically (e.g., a CI script that lints `workflows.json`). Easier to point at a dedicated file than to drill into project.json.

None of these apply today. The recommendation is A.

**What would flip the decision toward C:**
- Multiple downstream projects need to compose extensions from multiple sources (e.g., a shared org-level extension set plus project-specific additions). Directory-of-fragments naturally composes. Single-file array does not (merge conflicts on the array). No evidence today that this is needed.

---

## Open questions

For `/spec` to resolve:

1. **Schema validation surface.** Inline in triage skill body (instructions Claude follows), or in a separate `validate-additions.py`/`.sh` helper invoked by triage? **Lean inline** — matches every other "skill reads config" pattern. A helper script is justified only if validation logic exceeds ~30 lines of instructions.

2. **Anchor vocabulary.** Exactly which anchors are sanctioned? Recommended starting set (minimum viable):
   - `before:grant-commit`, `after:memory-flush`, `after:archive`, `before:commit`, `after:document`, `before:simplify`
   - Anchors that name phases in `exceptions` are silently dropped (task doesn't insert because the phase doesn't exist for this workflow).
   - Add more anchors per-need; do not enumerate all 10 phase boundaries up front (YAGNI).

3. **Conflict resolution: multiple additions at the same anchor.** Recommended: declaration order in the array. No `priority` field. If two extensions need an order between themselves, the user reorders the array.

4. **Schema versioning.** `.claude/project.json` already has `"$schema_version": 1`. The new `additions.workflow_tasks` field is additive (absent on old projects → no behavior change), so no schema bump is needed for introduction. Document this in the seed.md schema declaration.

5. **Dogfood location.** This repo's own `additions.workflow_tasks` array gets one entry — the `cli-copy-review` insertion. The entry lives in `.claude/project.json` (the live dev-repo copy). The shipped pristine template at `src/project.template.json` has an empty `workflow_tasks: []` array. **Note**: the recommender does not propose `workflow_tasks` additions (no auto-suggest); the user declares them manually.

6. **The retrofit step's order of operations.** Per the intake's AC-2, the hardcoded `cli-copy-review` conditional in triage SKILL.md is removed in the same commit that introduces the mechanism. Sequence:
   1. Add `workflow_tasks` schema to seed.md (+ src/seed.template.md mirror).
   2. Add `workflow_tasks: []` to src/project.template.json.
   3. Populate `.claude/project.json → additions.workflow_tasks` with the cli-copy-review entry.
   4. Modify triage SKILL.md to read + merge + remove the hardcoded conditional.
   5. Rebuild template; audit; test.

7. **Backward compatibility under `/init-project` re-runs.** Per init-project.md Step 7 idempotency rules, re-runs replace §16 in seed.md wholesale. For `additions.workflow_tasks`, re-runs SHALL preserve any populated entries — the user may have added project-specific extensions since the first init. The /init-project body must read existing `additions.workflow_tasks` before writing project.json, and re-emit the existing entries verbatim alongside any newly-recommended ones.

8. **Task-self-skip implementation for cli-copy-review.** When this workflow lands, the cli-copy-review skill needs a guard at its top: "if `git diff --name-only HEAD` (or the staged-but-uncommitted set) shows no entries matching `src/cli/tui/*.js`, `src/cli/*.js`, or `bin/cli.js`, report CLEAN and exit." This belongs in the cli-copy-review skill body, not in the workflow_tasks declaration. Out of scope for THIS workflow's spec; a follow-up edit to cli-copy-review SKILL.md.
