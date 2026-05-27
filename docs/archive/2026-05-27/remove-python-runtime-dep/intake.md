# Remove Python as a runtime dependency from the baseline

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Commit `9b54561` ("perf(hooks): port 22 hooks to Node ESM") removed `python3` from the hot path of every PreToolUse/PostToolUse/Stop/SessionStart hook. The baseline's documented runtime requirement (`docs/init/seed.md:41`) was downgraded from "python3 on PATH" to "python3 on PATH (skill-only)" to reflect that two skill helpers still ship as `.py` files and five skill `.sh` wrappers still embed `python3 <<'PY'` heredocs.

Concretely, a freshly installed baseline on a machine with no `python3` on PATH will:

- pass every hook because hooks no longer call `python3`;
- fail at `/memory-flush` Step 0a because `.claude/skills/memory-flush/sweep.py` cannot start;
- fail inside `/tdd`'s drift-check tick because `.claude/skills/tdd/drift_check.py` cannot start;
- fail at `/audit-baseline`, `/swarm-plan`, `/spec-render`, `/swarm-dispatch`, `/spec-lint` because each skill's `.sh` wrapper invokes `python3` via a heredoc;
- fail in 3 hook test fixtures (`regenerate-ac008.sh`, `memory_session_start_test.sh`, `memory_stop_intent_test.sh`) that probe hook output via `python3 -c`.

In addition, four governance pointers misrepresent the post-port state: `CLAUDE.md:288` and `src/CLAUDE.template.md:288` still claim hooks are "Bash + python3, no jq"; `docs/init/seed.md:40-41` + `src/seed.template.md` mirror documents `python3` as a required (skill-only) runtime; `.claude/memory/conventions.md → hook-script-shape` still asserts the legacy `python3 heredoc, no jq` contract; and `.claude/skills/harness/SKILL.md` instructs the harness to invoke drift-check via `python3 .claude/skills/tdd/drift_check.py --slug <slug>`.

## Goal

A user can install the baseline, run the full 11-phase workflow end-to-end, and pass `/audit-baseline` on a machine where `python3` is not on PATH. The baseline declares only `node ≥ 18.17` as its scripting-runtime requirement.

## Non-goals

- **Not** changing the hook execution model, performance envelope, or guard semantics. The `.mjs` hook port already delivered the ~5× startup improvement; this workflow is about removing the residual Python from skill-side helpers, not about re-architecting hooks.
- **Not** changing the external interface of any skill (`/memory-flush`, `/tdd`, `/audit-baseline`, etc. keep their current invocation contracts and observable outputs).
- **Not** removing Python from dev-time tooling the user installs outside the shipped baseline (e.g. third-party `.config/plugins/marketplaces/**` Python plugins, the `python.*http.server` pattern in `process_lifecycle_guard`'s advisory matcher — see Q-IN-03).
- **Not** rewriting tests beyond the minimum required to exercise the new `.mjs` entry points and to assert parity with the pre-port `.py` behavior on fixture inputs.
- **Not** addressing the related-but-separate backlog items `improved-backlog-item-detection-046c` or `seed-template-md-pre-redesign-drift-a1f3`.

## Success metrics

- **`python3` invocations remaining in shipped baseline files**: baseline 7 (2 `.py` files + 5 `.sh` heredocs), target 0, measured via `grep -rE "python3|\\.py\$" .claude/skills/ src/ scripts/ | grep -v 'tests/'`.
- **`.py` files in shipped manifest**: baseline 2 (`sweep.py`, `drift_check.py`), target 0, measured via `jq '.files | keys[] | select(endswith(".py"))' obj/template/.claude/manifest.json`.
- **Governance pointers naming python3 as a runtime requirement**: baseline 5 (`CLAUDE.md:288`, `src/CLAUDE.template.md:288`, `docs/init/seed.md:41`, `src/seed.template.md` mirror line, `conventions.md → hook-script-shape`), target 0, measured via `grep -rn "python3" CLAUDE.md src/CLAUDE.template.md docs/init/seed.md src/seed.template.md .claude/memory/conventions.md`.
- **Hook test fixtures invoking python3**: baseline 3, target 0, measured via `grep -l "python3" .claude/hooks/tests/`.
- **Parity-test deltas (golden-file diff between old `.py` output and new `.mjs` output)**: baseline N/A, target 0 bytes of diff on each fixture in the parity test corpus, measured via the new parity test suite under `tests/` or `.claude/skills/<slug>/tests/`.
- **`/audit-baseline` exit status on a fresh tree with `python3` masked**: baseline FAIL (cannot run audit), target PASS, measured via `PATH=$(echo "$PATH" | tr ':' '\n' | grep -v python | paste -sd:) bash .claude/skills/audit-baseline/audit.sh` (after the port; helper for `audit.sh` itself needs porting first — see AC-5).

## Stakeholders

This is a solo project. The same individual owns the request, the review, and the operating role.

- **Requester**: Tushar Srivastava (`razieldecarte@gmail.com`).
- **Reviewer**: Tushar Srivastava — gate A (`/approve-spec`) and gate C (`/grant-commit`) both fall on the same person.
- **Operator**: Tushar Srivastava — runs the baseline on his own machines + ships `@friedbotstudio/create-baseline` to downstream users (the latter is the population most exposed to a missing-`python3` machine).

## Constraints

- **Mirror byte-equivalence**: every edit to `CLAUDE.md` SHALL produce a matching edit to `src/CLAUDE.template.md`; every edit to `docs/init/seed.md` SHALL produce a matching edit to `src/seed.template.md`. Both pairs are enforced by existing byte-mirror tests; the workflow SHALL NOT relax either constraint.
- **Parity preservation**: the `.mjs` replacements for `sweep.py` and `drift_check.py` SHALL produce byte-identical output to the `.py` originals on a golden-file fixture corpus. Where output ordering depends on dict-iteration or filesystem order, the `.mjs` port SHALL canonicalize before comparison.
- **Audit invariant**: `/audit-baseline` SHALL continue to pass after the port. The audit's own runner (`audit.sh` with its python3 heredoc) is one of the surfaces being ported, so the audit's port lands together with the audit's own self-test.
- **Article XI shipped-manifest discipline**: `obj/template/.claude/manifest.json` is regenerated by `scripts/build-manifest.mjs`; the new `.mjs` files SHALL appear in `manifest.files` with sha256 entries, and `manifest.owners.skills` SHALL continue to enumerate the same baseline-owned skill slugs.
- **No regression in CLI-surface copy**: `bin/cli.js` help/error text and `README.md` references to runtime requirements SHALL be re-scanned in `/document` and updated if they mention `python3`.
- **Workflow is git-bound**: this is a git repository, so the full intake → commit pipeline runs unmodified; no auto-exceptions apply.
- **Track is `intake-full`**: full 11-phase pipeline (per the `/triage` decision). Swarm-vs-solo at Phase 6 is decided on the approved spec's component count.

## Acceptance criteria

1. **Given** a freshly cloned baseline repo on a machine with `python3` absent from PATH, **when** the user runs `bash .claude/skills/audit-baseline/audit.sh` (now ported), **then** the audit exits 0 with no `cannot execute python3` or equivalent runtime errors.
2. **Given** the pre-port `.py` files' behavior captured as golden-file fixtures, **when** the new `.mjs` ports are run against the same inputs, **then** the diff between `.py` output and `.mjs` output is exactly 0 bytes for every fixture in the parity corpus (or, where iteration-order canonicalization is required, after equal canonicalization both ports produce identical canonical output).
3. **Given** the 5 in-shell `python3` heredocs (`audit.sh`, `validate.sh`, `render.sh`, `swarm_merge.sh`, `lint.sh`), **when** the workflow has landed, **then** zero `python3` invocations exist in `.claude/skills/**/*.sh` (measured via `grep -rn "python3" .claude/skills/`) and each former heredoc's replacement entry point passes its own per-skill parity test on at least one fixture.
4. **Given** the 3 hook test fixtures (`regenerate-ac008.sh`, `memory_session_start_test.sh`, `memory_stop_intent_test.sh`), **when** the workflow has landed, **then** they continue to exercise the same assertions on hook JSON output via a Node-based probe (either `node -e` inline or a shared `.mjs` helper — to be decided in /spec) and exit 0.
5. **Given** the four governance pointers (`CLAUDE.md:288`, `src/CLAUDE.template.md:288`, `docs/init/seed.md:40-41` + mirror, `.claude/memory/conventions.md → hook-script-shape`), **when** the workflow has landed, **then** none of them claim `python3` as a baseline runtime requirement and the existing byte-mirror tests (`tests/byte-mirror.*` if present, or the in-skill mirror checks the audit performs) continue to pass.
6. **Given** the harness skill's drift-check invocation in `.claude/skills/harness/SKILL.md` (line referencing `python3 .claude/skills/tdd/drift_check.py --slug <slug>`), **when** the workflow has landed, **then** the invocation reads `node .claude/skills/tdd/drift_check.mjs --slug <slug>` and the harness's existing drift-check tick still produces a report at `.claude/state/drift/<slug>.md`.
7. **Given** the shipped manifest (`obj/template/.claude/manifest.json` and the `.claude/manifest.json` consumed at install time), **when** the workflow has landed, **then** no entry in `manifest.files` has a `.py` suffix and every new `.mjs` file appears in `manifest.files` with a sha256.
8. **Given** the seed.md runtime-requirements section, **when** the workflow has landed, **then** the `python3` bullet is removed (not downgraded), with the corresponding mirror update in `src/seed.template.md` such that the byte-mirror test passes.
9. **Given** `/audit-baseline`'s "owner: baseline" enumeration check, **when** the workflow has landed, **then** every former-Python skill (`memory-flush`, `tdd`, `audit-baseline`, `swarm-plan`, `spec-render`, `swarm-dispatch`, `spec-lint`) still declares `owner: baseline` in its `SKILL.md` frontmatter and its on-disk hash matches the manifest entry.

## Open questions

- **Q-IN-01** — For each of the 5 skill `.sh` wrappers (`audit.sh`, `validate.sh`, `render.sh`, `swarm_merge.sh`, `lint.sh`), does the port collapse the wrapper into a single `.mjs` file (when the `.sh` does nothing except env var setup + the heredoc) or keep a thin shell stub that invokes a new `.mjs` helper (when the `.sh` has meaningful pre-Python bash logic — path canonicalization, jq-style data prep, exit-code translation)? To be resolved per-wrapper in `/scout`; `/spec` records the chosen shape per wrapper in its component table.
- **Q-IN-02** — For the 3 hook test fixtures probing JSON output, the cleanest replacements are (a) `node -e '...'` inline or (b) a shared `.mjs` helper at `.claude/hooks/tests/lib/probe.mjs`. Option (a) is fewer files but inlines JSON-parsing logic in every test; option (b) introduces a small abstraction with one consumer + two more incoming. To be resolved in `/spec` after weighing the YAGNI rule against the inlining tax.
- **Q-IN-03** — The `process_lifecycle_guard`'s advisory matcher includes `python.*http.server` (catching dev-time `python3 -m http.server` users may run outside the baseline). After this workflow removes `python3` from the baseline's own runtime, does this pattern stay (it's advisory; users may still run Python dev servers) or get removed (the baseline no longer ships any Python)? Recommended keep; to be confirmed in `/scout`.
- **Q-IN-04** — Two governance surfaces (`README.md`, `bin/cli.js` help text) and the public docs site (`site-src/**`) may reference `python3` as a baseline requirement. The scout phase SHALL grep these surfaces; the spec's `write_set` SHALL include any matches. Flagged here so /document doesn't discover them late.
- **Q-IN-05** — The `swarm.exempt_path_prefixes` field in `project.json` allows the swarm contract to write outside its declared `write_set`. If `/swarm-plan` decides to route this workflow's components in parallel, does the port's mirror-edit pair (e.g., editing `CLAUDE.md` AND `src/CLAUDE.template.md` in the same wave) count as one task or two? Likely one (the byte-mirror is an invariant of the edit, not a separate work item); to be resolved in `/swarm-plan` if we route to swarm.
