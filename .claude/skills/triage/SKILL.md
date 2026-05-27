---
name: triage
owner: baseline
description: Triage an incoming request — pick the workflow entry phase (intake / spec / tdd / chore) and record the workflow statefile that the Track Guard reads.
argument-hint: "<request in plain English>"
---

Triage the user's request and set up `.claude/state/workflow.json` so downstream phase skills and the Track Guard hook know which track we're on.

# Decision rules (per seed.md)

- **New implementation / feature**: entry = `intake`. Full 11-phase pipeline.
- **Bugfix**: entry = `spec` (Phase 4) OR `tdd` (Phase 6), depending on whether the bug needs a written spec. Ask if unclear; default to `spec` when the bug affects contract/behaviour and `tdd` when it's a localized misbehaviour with a known failing case.
- **Quickfix** (typo across multiple files, multi-file config tweak, small bundled patch): entry = `tdd`. May also mark phases `intake`, `scout`, `research`, `spec`, `review` as exceptions.
- **Chore** (no TDD-driven code change needed): entry = `chore`. Choose chore when the request has no failing-test-driven code change — documentation edits, governance count refreshes, vendored-skill content updates, configuration tweaks, formatting / typo fixes, dependency bumps where no project code changes, skill consolidation moves, file renames with no behaviour change. The classification rule is *"if there's no failing test that should exist for this work, it's a chore"*. Mark `intake` / `brd` / `scout` / `research` / `spec` / `review` / `tdd` as exceptions in `workflow.json`; **leave `simplify`, `security`, `integrate`, `document`, `archive` and `commit` in the phase list** — the chore skill itself decides which of those phases to actually run based on its conditional triggers (it does not silently skip them). If the request needs a failing test to drive correctness, route to `tdd` or higher instead.

# Steps

1. Restate the request back to the user in 1-2 sentences, and name the entry phase you've chosen and why.
2. **Git-repo detection (mandatory).** Run `git rev-parse --is-inside-work-tree 2>/dev/null` at the project root. If the exit status is non-zero, the project is not a git repository: gate C / `commit` are inapplicable AND the swarm path is unavailable because worktree isolation (the swarm contract's physical safety mechanism) requires git (CLAUDE.md Article IV "Phase 6c and Phase 11 are git-conditional", Article VII). Append `"swarm-plan"`, `"approve-swarm"`, `"swarm-dispatch"`, `"grant-commit"`, `"changelog"`, and `"commit"` to the exceptions array you'll write in step 4. `"changelog"` is auto-excepted alongside `"commit"` because Phase 11.5 is a pre-commit curator with no purpose outside a commit-bearing workflow. Tell the user: "Non-git project detected — `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, `changelog`, and `commit` auto-excepted. Phase 6 routes to solo `/tdd`. Workflow ends after `/archive`. Persistence outside git is your responsibility."
3. If the user has not confirmed yet, ask: "Entry phase = <X>. Exceptions = <Y>. Proceed? (or tell me a different entry)"
4. On confirmation, write `.claude/state/workflow.json` (post-§18 shape — uses `track_id` from the chosen Track in `.claude/workflows.jsonl`, NOT the old `entry_phase` field):
   ```json
   {
     "request": "<the request>",
     "slug": "<workflow slug>",
     "track_id": "<intake-full|spec-entry|tdd-quickfix|chore>",
     "exceptions": ["<phase>", ...],
     "completed": [],
     "skipped_alternates": [],
     "source_backlog_keys": ["<backlog stable key>", ...],
     "created_at": <epoch>,
     "updated_at": <epoch>
   }
   ```

   The `track_id` value is the `track_id` field of the Track you picked in step 5c above (one of `intake-full`, `spec-entry`, `tdd-quickfix`, `chore`, OR a project-declared selectable Track from `.claude/workflows.jsonl`). The legacy pre-§18 field `entry_phase` is NOT written — downstream skills (intake / tdd / chore / harness) read `track_id` directly. Pre-§18 workflow.json files (those that still carry `entry_phase`) are auto-migrated by harness preflight Step 3a via the shipped `.claude/skills/harness/workflow-migrator.js` mirror (synced from `src/cli/workflow-migrator.js` at build time by `scripts/build-template.sh` Stage 0b).

   The `source_backlog_keys` field is optional. When the user's request explicitly names one or more backlog entries this workflow picks up (the common framing is a `Source:` line listing backlog keys), populate the array with those keys. `/commit` (Phase 11) reads this field and invokes `sweep.py --mode stamp-closure` after the commit lands, stamping each named entry with `status: picked-up` + `superseded-at: <today>` so the next `/memory-flush` Step 0a auto-closes them. Absent / empty array → `/commit` skips the stamp step entirely (backward-compatible for any workflow that pre-dates the field). `/triage` does NOT auto-detect backlog keys from free-form prose — the user populates the field (or names them in the triage prompt and you populate it during step 4).
5. **Seed the workflow tasklist** — workflows.jsonl-driven (post-§18; per CLAUDE.md Article IV amendment + seed.md §18).

   **Source of truth.** `.claude/workflows.jsonl` declares every Track this project can execute, one Track per JSONL line. The four canonical tracks (intake-full, spec-entry, tdd-quickfix, chore) plus any per-project additions live there. Sub-tracks (selectable=false; e.g., swarm-implementation, tdd-worker-chain) are referenced by `sub_track:` in selector-node alternates.

   **Procedure:**

   a. **Load + validate.** Run `node .claude/skills/triage/seed-tasklist.mjs --validate-only` to parse `.claude/workflows.jsonl` and verify every Track against the §18 invariants (I1..I11). On validation failure, the helper exits non-zero and prints a named error citing the offending track / node / line. Halt triage; tell the user to fix `workflows.jsonl` or run `/init-project doctor` to repair drift.

   b. **Classify (LLM-driven).** Read each *selectable* Track's `name`, `description`, and `selector_hints` from `workflows.jsonl`. Match against the user's request using natural-language reasoning — selector_hints are descriptive aids, NOT match tokens. Rank the tracks by plausibility for the request. Selectable Tracks whose track-level `preconditions[]` evaluate false in this project (e.g., `requires_git` on a non-git project) are excluded from the candidate set BEFORE ranking — they cannot be picked.

   c. **Confirm (AskUserQuestion, always).** Present the picked Track plus the top 2-3 alternates via `AskUserQuestion`. Confidence thresholds are not used; the user picks. On ambiguity (e.g., chore vs intake-full for a documentation refactor), surface both and let the user decide.

   d. **Materialize TaskList.** Run `node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug>` to emit the canonical TaskList JSON for the chosen Track (subjects, activeForms, metadata.phase, needs_user, blockedBy by ordinal — driven by the shipped `.claude/skills/triage/track-tasklist-materializer.js` mirror, synced from `src/cli/track-tasklist-materializer.js` at build time). For each entry, call `TaskCreate` to register the task; capture the returned task_id. For each entry's `blockedBy` ordinals, call `TaskUpdate addBlockedBy` mapping ordinals to the captured task_ids of the predecessor entries.

   e. **`source_backlog_keys` (optional).** If the user's request names backlog entries (typical framing: a `Source:` line listing backlog keys), populate `workflow.json → source_backlog_keys` with those keys. `/commit` reads this and stamps closure on the named entries after the commit lands.

   **Fallback for missing workflows.jsonl.** A baseline install always ships `.claude/workflows.jsonl` (pristine template overlaid by `scripts/build-template.sh` Stage 2; CLI install copies it). If the file is missing on disk, the install is broken — halt triage with a named error and tell the user to run `/init-project doctor` to regenerate the file from the pristine template.

   **Non-git projects.** Tracks declaring `git_only` invariant (e.g., `swarm-implementation`) are excluded from the candidate set on non-git projects. The `commit`-bearing tracks (intake-full, spec-entry, tdd-quickfix, chore) auto-except their `grant-commit`, `changelog`, `commit` nodes — the materializer's runtime context (passed by triage) carries an `excluded_node_ids` set; the helper skips those nodes during TaskCreate emission.

   **Reference: canonical track shapes (mirrored in workflows.jsonl).** The four selectable tracks shipped in the pristine template are byte-equivalent to these pre-§18 ordering descriptions:

   **For `chore` track** (single phase + memory-flush + commit gate):
   - `Run /chore for <slug>` — activeForm: "Running chore", metadata: `{"phase": "chore"}`
   - `Run /memory-flush for <slug>` — activeForm: "Running memory-flush", metadata: `{"phase": "memory-flush"}`, addBlockedBy previous
   - `Wait for /grant-commit` — metadata: `{"phase": "grant-commit", "needs_user": true}`, addBlockedBy previous
   - `Run /changelog for <slug>` — activeForm: "Running changelog", metadata: `{"phase": "changelog"}`, addBlockedBy previous
   - `Run /commit for <slug>` — activeForm: "Running commit", metadata: `{"phase": "commit"}`, addBlockedBy previous

   **For `tdd`-entry quickfix track** (skip intake/scout/research/spec/review):
   - `Run /tdd`, `Run /simplify`, `Run /security` (only if not in exceptions), `Run /integrate`, `Run /document`, `Run /archive`, `Run /memory-flush`, `Wait for /grant-commit` (`needs_user`), `Run /changelog`, `Run /commit` — each with `addBlockedBy` set to the previous task's id.

   **For `spec`-entry track** (skip upstream): `Run /spec`, `Wait for /approve-spec <path>` (`needs_user`), `Run /tdd`, `Run /simplify`, `Run /security` (unless excepted), `Run /integrate`, `Run /document`, `Run /archive`, `Run /memory-flush`, `Wait for /grant-commit` (`needs_user`), `Run /changelog`, `Run /commit` — each with `addBlockedBy` set to the previous task's id.

   **For `intake`-entry full track**: `Run /intake`, `Run /brd` (only if stakeholder-heavy), `Run /scout`, `Run /research`, `Run /spec`, `Wait for /approve-spec <path>` (`needs_user`), `Run /tdd` OR (`Run /swarm-plan`, `Wait for /approve-swarm <slug>` (`needs_user`), `Run /swarm-dispatch`), `Run /simplify`, `Run /security` (unless excepted), `Run /integrate`, `Run /document`, `Run /archive`, `Run /memory-flush`, `Wait for /grant-commit` (`needs_user`), `Run /changelog`, `Run /commit`. **On non-git projects the swarm branch SHALL NOT be seeded** — only `Run /tdd` goes in the list. Swarm-vs-solo is a Phase-6 main-context decision (per CLAUDE.md Article V) only on git projects; non-git workflows resolve to solo at triage time because `swarm-plan`, `approve-swarm`, and `swarm-dispatch` are already in `exceptions`. On non-git projects `changelog` is also auto-excepted alongside `commit`.

   For every task: `subject` is imperative ("Run /scout for <slug>" / "Wait for /approve-spec <path>"); `description` names the phase + the slug; `metadata.phase` carries the phase name; consent-gate tasks set `metadata.needs_user: true`. Wire `addBlockedBy` so each task blocks until its predecessor completes — this surfaces the workflow's true dependency graph and prevents `/harness` from racing past a gate.

6. Tell the user the next concrete step to run: e.g. `/intake`, `/spec`, `/tdd`, `/chore`, or `/harness` to autopilot.

# Constraints

- NEVER skip triage by guessing from filename or diff alone. The user's natural-language framing is the primary signal.
- The Track Guard reads `track_id` (post-§18) OR legacy `entry_phase`, plus `exceptions`. If the user wants to skip an optional phase (e.g. `security`), add it to `exceptions` — do not silently re-order `workflow.phases` in project.json.
- If a workflow.json already exists for an open request, ask whether to replace it (starts a fresh track) or add to `completed` (continuing the same track).
