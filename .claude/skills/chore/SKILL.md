---
name: chore
owner: baseline
description: Workflow track for tasks that need no TDD — documentation edits, governance count bumps, vendored-skill content updates, configuration tweaks, formatting, typo fixes, dependency bumps where no project code changes. Skips `/scenario` and `/implement` (no failing test to drive) and runs the work directly. `verify`, `archive`, `memory-flush`, `/grant-commit`, and `/commit` remain mandatory. `simplify`, `integrate`, and `document` are conditional — required when the diff hits one of the listed triggers, optional otherwise. Chore is a stripped-down pipeline, not a bypass; never silently skip a conditional phase whose triggers apply.
argument-hint: "<one-line description of the chore>"
---

# chore — workflow for tasks that don't need TDD

This skill runs a stripped-down workflow for tasks where nothing is meaningfully driven by a failing test. The full `/tdd` RALPH cycle is theatre when the change is "fix a typo", "update a count", "remap a vendored path", or "tighten a description" — there is no test that catches a typo, and the project audit (or a downstream lint) serves as the regression check.

The chore workflow exists so this class of work can move with the **right** ceremony — real verification of "did I break anything" without the scenario+implement loop, and conditional simplify/integrate/document passes when the diff actually warrants them.

## Definition: when is a task a chore?

A task is a **chore** if and only if **it has no code changes that need TDD**. Concretely, a chore is anything from this list:

- Documentation edits — `README.md`, `CLAUDE.md` prose, `docs/init/seed.md` prose, governance count refreshes, skill SKILL.md descriptions, reference docs.
- Vendored-skill content updates — path remaps (e.g. `.agents/` → `.claude/skills/`), count refreshes, "Related Skills" annotations, license-required modification notices.
- Configuration tweaks — `project.json`, `.mcp.json`, `settings.json` edits whose behavioural effect is config-driven (a new declaration, a flipped flag) rather than code-driven.
- Formatting / typo fixes anywhere in the repo.
- Dependency bumps where no project code changes alongside.
- Skill consolidation moves — collapsing a single-consumer skill into its consumer's `references/` directory.
- File renames or path remaps with no behavioural change.

A task is **not a chore** if any of:

- New runtime behaviour is being added — the failing test is the only way to drive it correctly.
- A bug is being fixed and regressing to that bug would be undetectable without a test — the fix SHALL come with a test.
- A refactor changes behaviour under specific inputs — TDD captures the boundary.

The classification rule is: *if there is no failing test that should exist for this work, it is a chore. Otherwise it is `/tdd` (or higher).*

`/triage` decides the classification; this skill confirms it on entry.

## Prereq

`.claude/state/workflow.json` exists with `entry_phase: "chore"` (written by `/triage`). If the prereq is not met, refuse and surface the mismatch.

## Phase shape

### Mandatory phases (always run)

1. **Edit** — apply the change directly. No `/scenario`, no `/implement` — there is no failing test to drive.
2. **`verify`** — run the project test command and stamp `.claude/state/last_test_result`. FAIL means stop, surface, and route the user to `/triage` for a proper bugfix track. The verdict is binding (the `verify_pass_guard` hook reads this file).
3. **`archive`** — empty bundle is fine; `/commit`'s prereq requires `archive` in `completed`.
4. **`memory-flush`** — Phase 10.6. Empty pending is fine (fast-path runs Step 0 sweeps and short-circuits). `/commit`'s prereq requires `memory-flush` in `completed`.
5. **`/grant-commit` then `/commit`** — user-required consent + commit. Same as every other workflow.

### Conditional phases (required when triggers apply, optional otherwise)

5. **`simplify`** — required when **any** of:
   - Diff exceeds ~30 lines OR touches more than 3 files.
   - The change includes refactor-like moves (renames, restructuring, file relocations).
   - The chore creates duplication that future cleanup will need to consolidate.
   - More than one file in the diff would benefit from a reuse / structure pass.
   Otherwise skip — and say so in your end-of-chore summary so the choice is auditable.

6. **`integrate`** — required when **any** of:
   - The diff touches the test surface — test command, fixtures, hook scripts, `settings.json` hook wiring, `project.json → test/lint` keys.
   - The diff alters MCP server declarations or runtime config that affects how the harness behaves.
   - The diff could plausibly break unrelated downstream phases (e.g. editing an audit script's `EXPECTED_*` set).
   Otherwise the mandatory `verify` stamp is sufficient — note the skip in the summary.

7. **`document`** — required when **any** of:
   - User-facing prose changes — `README.md`, `CLAUDE.md` prose, `docs/init/seed.md` prose, skill `SKILL.md` `description:` lines, public-facing reference docs.
   - Counts or inventories change — skill count, hook count, command count, MCP server count, alternate-track count.
   - New conventions are introduced — a new helper file, a new reference doc, a new directory.
   - The `seed.md §16` follow-ups list needs an entry resolved or added.
   - The chore touches `src/` templates (the templates are user-facing once `npx @friedbotstudio/create-baseline` runs).
   Otherwise skip — note in the summary.

If a conditional phase is required, run it **before** `/grant-commit`. If you skip one, the end-of-chore summary SHALL state which conditional phases were skipped and why. Silent skips are not allowed.

## Steps

1. Read `.claude/state/workflow.json`. Confirm `entry_phase == "chore"`. If not, stop and surface the mismatch — the user reached this skill without the correct triage classification.
2. Restate the intended edits inline: file paths, brief description per file, estimated total diff size. Confirm with the user if anything is ambiguous.
3. Apply the edits via `Edit` / `MultiEdit` / `Write`. Honour the engineering rules from CLAUDE.md Article VI (no stubs, no commented-out code, no `TODO` / `FIXME` / `HACK` / `XXX`).
4. **Run the binding test command and stamp the verdict (inlined verify).** Per `.claude/skills/verify/SKILL.md` (the contract doc): read `.claude/project.json → test.cmd`; run via Bash from project root (capture stdout, stderr, exit code; no retry); apply verdict rules (`PASS` iff exit 0 AND at least one test executed AND no failed/errored test; otherwise `FAIL`); atomically write `.claude/state/last_test_result` with the canonical four-line format. The `verify_pass_guard` hook reads line 1 as the binding verdict. If the verdict is `FAIL`, stop — the user investigates; chore does not loop. Write `.claude/state/harness_state` with `state: "yielded"` and `reason: "chore verify FAIL"` so the Stop hook stays silent.
5. Walk the conditional triggers in order. For each:
   - **Required** → invoke the phase skill and append it to `workflow.json → completed`.
   - **Skipped** → record the rationale in your end-of-chore summary; do not append to `completed`.
6. Invoke `Skill(archive)` — mandatory.
6.5. Invoke `Skill(memory-flush)` — mandatory (Phase 10.6). Runs Step 0 canonical sweeps and, if `_pending.md` is non-empty, full triage. On empty pending the fast-path returns success in ≤ 3 sweep.py invocations.
7. Append `"chore"`, `"archive"`, `"memory-flush"`, and any conditional phases that ran to `workflow.json → completed`. Update `updated_at` to the current epoch.
8. **Marker op FIRST, then write `harness_state`, then emit end-of-chore summary.** On `state: "continue"` (more phases follow, e.g. archive is still pending): `echo "<slug>" > .claude/state/.harness_active` to refresh the active marker, then write `.claude/state/harness_state` with `{state: "continue", slug, reason}`. On `state: "done"` (archive just appended and no further phases remain): `rm -f .claude/state/.harness_active`, then write `harness_state` with `{state: "done", slug, reason}`. The state file carries exactly three keys; no `written_at`, no `tick_count`. Then tell the user:
   - "Chore green."
   - Files changed.
   - Conditional phases run (and why).
   - Conditional phases skipped (and why).
   - "Run `/grant-commit`, then `/commit` to finalize." *(omit this line on non-git projects where commit is excepted; instead say "Workflow ends after `/archive` on this non-git project.")*

## Constraints

- The `verify` stamp is binding. `verify_pass_guard` reads `.claude/state/last_test_result`; that file is the truth.
- No subagent delegation — Article II applies to chore the same as every other phase skill.
- A `FAIL` from `verify` is non-recoverable inside this skill — chore does not loop. If the audit reveals a real bug, the user runs `/triage` for a proper bugfix track.
- Conditional phases are *conditional*, not *forbidden*. **If in doubt, run them.** The cost of running a `simplify` or `document` pass that turned out unnecessary is small; the cost of skipping one whose triggers actually applied is shipping drift.
- The end-of-chore summary SHALL document every conditional-phase skip. Silent skips defeat the auditability the chore workflow is designed for.
- Chore is **not** a bypass for the canonical workflow's quality gates. It is a stripped-down ordering of the same gates, with the test-first phases removed because there is nothing to test-first.
