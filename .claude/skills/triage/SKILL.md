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
- **Freeform** (ad-hoc batch of heterogeneous edits): entry = `freeform`. Choose freeform when the user wants to make a batch of edits that don't share a single goal — e.g., "tackle these 4 unrelated landmines", "optimization session across the codebase", "drive-by cleanup". Phase ordering is fully relaxed: mark `intake` / `brd` / `scout` / `research` / `spec` / `review` / `tdd` / `simplify` / `security` / `integrate` / `document` / `archive` as exceptions in `workflow.json`. The DAG carries only `memory-flush` → `grant-commit` → `commit`. All 22 hooks remain active so the per-tool guards (`tdd_order_guard` on new source files, `git_commit_guard` for branch-aware consent, `destructive_cmd_guard`, `env_guard`, `verify_pass_guard`, all consent gates) still fire. Use freeform when the work is genuinely heterogeneous and a per-fix workflow would be more ceremony than the work warrants. Anything single-purpose with a clear failing-test path SHALL route to `tdd` or higher.
- **Epic** (multi-subtask feature, discovery-once): entry = `epic` (track_id `epic`). Choose when the request decomposes into ≥ `project.json → epic.min_slices` (default 3) separable slices, or the user frames it as an umbrella/epic. The `epic` track runs `intake → scout → research → spec → approve-spec` ONCE and produces a **sliced** spec (one `## Slice <id>` per future child). See **Epic / epic-child setup** below and seed.md §18.9. Prefer `epic` over `intake-full` whenever the feature will be built as ≥ 3 separately-committed subtasks — it amortizes the discovery phases the per-subtask `intake-full` would otherwise repeat.
- **Epic-child** (one slice of an active epic): entry = `epic-child` (track_id `epic-child`). Auto-select when an `.claude/state/epic/*.json` with `approved: true` exists AND the request matches one of its open slices. Inherits the epic's discovery via pins (enforced by `track_guard`); runs the effective fast path `tdd → integrate → archive → grant-commit → commit`. See **Epic / epic-child setup** below.

# Steps

1. Restate the request back to the user in 1-2 sentences, and name the entry phase you've chosen and why.
2. **Git-repo detection (mandatory).** Run `git rev-parse --is-inside-work-tree 2>/dev/null` at the project root. If the exit status is non-zero, the project is not a git repository: gate C / `commit` are inapplicable AND the swarm path is unavailable because worktree isolation (the swarm contract's physical safety mechanism) requires git (CLAUDE.md Article IV "Phase 6c and Phase 11 are git-conditional", Article VII). Append `"swarm-plan"`, `"approve-swarm"`, `"swarm-dispatch"`, `"grant-commit"`, and `"commit"` to the exceptions array you'll write in step 4. Tell the user: "Non-git project detected — `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, and `commit` auto-excepted. Phase 6 routes to solo `/tdd`. Workflow ends after `/archive`. Persistence outside git is your responsibility."
3. If the user has not confirmed yet, ask: "Entry phase = <X>. Exceptions = <Y>. Proceed? (or tell me a different entry)"
4. On confirmation, write `.claude/state/workflow.json` (post-§18 shape — uses `track_id` from the chosen Track in `.claude/workflows.jsonl`, NOT the old `entry_phase` field):
   ```json
   {
     "request": "<the request>",
     "slug": "<workflow slug>",
     "track_id": "<intake-full|spec-entry|tdd-quickfix|chore|freeform>",
     "exceptions": ["<phase>", ...],
     "completed": [],
     "skipped_alternates": [],
     "source_backlog_keys": ["<backlog stable key>", ...],
     "created_at": <epoch>,
     "updated_at": <epoch>
   }
   ```

   The `track_id` value is the `track_id` field of the Track you picked in step 5c above (one of `intake-full`, `spec-entry`, `tdd-quickfix`, `chore`, `freeform`, OR a project-declared selectable Track from `.claude/workflows.jsonl`). The legacy pre-§18 field `entry_phase` is NOT written — downstream skills (intake / tdd / chore / harness) read `track_id` directly. Pre-§18 workflow.json files (those that still carry `entry_phase`) are auto-migrated by harness preflight Step 3a via the shipped `.claude/skills/harness/workflow-migrator.js` mirror (synced from `src/cli/workflow-migrator.js` at build time by `scripts/build-template.sh` Stage 0b).

   The `source_backlog_keys` field is optional. When the user's request explicitly names one or more backlog entries this workflow picks up (the common framing is a `Source:` line listing backlog keys), populate the array with those keys. `/commit` (Phase 11) reads this field and invokes `sweep.mjs --mode stamp-closure` after the commit lands, stamping each named entry with `status: picked-up` + `superseded-at: <today>` so the next `/memory-flush` Step 0a auto-closes them. Absent / empty array → `/commit` skips the stamp step entirely (backward-compatible for any workflow that pre-dates the field). `/triage` does NOT auto-detect backlog keys from free-form prose — the user populates the field (or names them in the triage prompt and you populate it during step 4).
5. **Seed the workflow tasklist** — workflows.jsonl-driven (post-§18; per CLAUDE.md Article IV amendment + seed.md §18).

   **Source of truth.** `.claude/workflows.jsonl` declares every Track this project can execute, one Track per JSONL line. The five canonical selectable tracks (intake-full, spec-entry, tdd-quickfix, chore, freeform) plus any per-project additions live there. Sub-tracks (selectable=false; e.g., swarm-implementation, tdd-worker-chain) are referenced by `sub_track:` in selector-node alternates.

   **Procedure:**

   a. **Load + validate.** Run `node .claude/skills/triage/seed-tasklist.mjs --validate-only` to parse `.claude/workflows.jsonl` and verify every Track against the §18 invariants (I1..I11). On validation failure, the helper exits non-zero and prints a named error citing the offending track / node / line. Halt triage; tell the user to fix `workflows.jsonl` or run `/init-project doctor` to repair drift.

   b. **Classify (LLM-driven).** Read each *selectable* Track's `name`, `description`, and `selector_hints` from `workflows.jsonl`. Match against the user's request using natural-language reasoning — selector_hints are descriptive aids, NOT match tokens. Rank the tracks by plausibility for the request. Selectable Tracks whose track-level `preconditions[]` evaluate false in this project (e.g., `requires_git` on a non-git project) are excluded from the candidate set BEFORE ranking — they cannot be picked.

   c. **Confirm (AskUserQuestion, always).** Present the picked Track plus the top 2-3 alternates via `AskUserQuestion`. Confidence thresholds are not used; the user picks. On ambiguity (e.g., chore vs intake-full for a documentation refactor), surface both and let the user decide.

   d. **Materialize TaskList.** Run `node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug>` to emit the canonical TaskList JSON for the chosen Track (subjects, activeForms, metadata.phase, needs_user, blockedBy by ordinal — driven by the shipped `.claude/skills/triage/track-tasklist-materializer.js` mirror, synced from `src/cli/track-tasklist-materializer.js` at build time). For each entry, call `TaskCreate` to register the task; capture the returned task_id. For each entry's `blockedBy` ordinals, call `TaskUpdate addBlockedBy` mapping ordinals to the captured task_ids of the predecessor entries.

   e. **`source_backlog_keys` (optional).** If the user's request names backlog entries (typical framing: a `Source:` line listing backlog keys), populate `workflow.json → source_backlog_keys` with those keys. `/commit` reads this and stamps closure on the named entries after the commit lands.

   **Fallback for missing workflows.jsonl.** A baseline install always ships `.claude/workflows.jsonl` (pristine template overlaid by `scripts/build-template.sh` Stage 2; CLI install copies it). If the file is missing on disk, the install is broken — halt triage with a named error and tell the user to run `/init-project doctor` to regenerate the file from the pristine template.

   **Non-git projects.** Tracks declaring `git_only` invariant (e.g., `swarm-implementation`) are excluded from the candidate set on non-git projects. The `commit`-bearing tracks (intake-full, spec-entry, tdd-quickfix, chore) auto-except their `grant-commit`, `commit` nodes — the materializer's runtime context (passed by triage) carries an `excluded_node_ids` set; the helper skips those nodes during TaskCreate emission.

   **Reference: canonical track shapes.** The selectable tracks (chore, tdd-quickfix, spec-entry, intake-full, freeform) and the two sub-tracks are declared authoritatively in `.claude/workflows.jsonl` — one Track per line, each with its node DAG (`nodes[]` with `id`, `depends_on`, `metadata.phase`, `needs_user`). That file is the single source of the canonical track shapes; read it directly rather than relying on a prose copy here (the prior duplicated templates were removed in WF-5 to prevent drift). The materializer (`track-tasklist-materializer.js`) renders the same DAGs into the TaskList. Non-git projects: `commit`-bearing tracks auto-except `grant-commit`, `commit` (and intake-full's swarm branch) per the Non-git note above.

   For every task: `subject` is imperative ("Run /scout for <slug>" / "Wait for /approve-spec <path>"); `description` names the phase + the slug; `metadata.phase` carries the phase name; consent-gate tasks set `metadata.needs_user: true`. Wire `addBlockedBy` so each task blocks until its predecessor completes — this surfaces the workflow's true dependency graph and prevents `/harness` from racing past a gate.

6. Tell the user the next concrete step to run: e.g. `/intake`, `/spec`, `/tdd`, `/chore`, or `/harness` to autopilot.

# Epic / epic-child setup (§18.9)

These two tracks carry extra state beyond `workflow.json`. Set it up at triage time.

## Materializing an `epic` track

After writing `workflow.json` (track_id `epic`) and seeding the TaskList, **propose the slices** and confirm them with the user:

1. Decompose the feature into separable slices (each a future child, each owning a disjoint set of acceptance criteria). Aim for ≥ `project.json → epic.min_slices`. Present the proposed slice list via `AskUserQuestion` (the user may merge/split). Do **not** design solutions — slices are scoping units, not implementations.
2. For each slice, assess `risk[]` from its scope using the seed §18.9 escalation table — `security` (auth / IO boundary / untrusted-input parsing / a path under `project.json → security.sensitive_globs`), `simplify` (spans > 1 layer or > `simplify.min_files` files), `document` (public API / CLI / `docs/**` change). Record the flags; they drive each child's review escalation later.
3. Write `.claude/state/epic/<slug>.json` with `epic`, the three discovery artifact paths (`spec`/`scout`/`research` at `docs/.../<slug>.md`), `slices[]` (`{id, title, acs, risk}`), `approved: false`, `children: []`, and timestamps. The file is gitignored runtime state.
4. The epic's `/approve-spec` (gate A) covers **all** slices — there is no per-slice approval. The `approved` flag flips to `true` when the epic's `approve-spec` phase completes (the harness does this post-gate; never set it yourself ahead of the real consent).

`/spec`, on an `epic` track, reads `slices[]` and writes one `## Slice <id>` section per slice (see the spec skill).

## Materializing an `epic-child` track

Only selectable when an `.claude/state/epic/*.json` with `approved: true` is active. For the matched open slice:

1. Write `workflow.json` (track_id `epic-child`) with `epic: "<epic-slug>"`, `slice: "<id>"`, and `pinned_artifacts: {scout, research, spec}` — the spec pin carries the `#slice-<id>` fragment (e.g. `docs/specs/<epic>.md#slice-A`).
2. Set `exceptions` to the inherited discovery phases (`intake`, `scout`, `research`, `spec`, `approve-spec`) **plus** `simplify` / `security` / `document` **unless** the slice's `risk[]` escalates one — an escalated phase is left OUT of `exceptions` (so it runs) and the reason is recorded in `completed_notes`. `track_guard` will refuse every write until the named epic is `approved: true` and the pins resolve, so a child can never skip discovery without a real approved epic behind it.
3. Append `{slice, slug, status: "open"}` to the epic state's `children[]`.

`/tdd`, on an `epic-child` track, reads the pinned spec's `## Slice <id>` section as its behavior contract — it does **not** re-run any discovery phase.

# Constraints

- NEVER skip triage by guessing from filename or diff alone. The user's natural-language framing is the primary signal.
- The Track Guard reads `track_id` (post-§18) OR legacy `entry_phase`, plus `exceptions`. If the user wants to skip an optional phase (e.g. `security`), add it to `exceptions` — do not silently re-order `workflow.phases` in project.json.
- If a workflow.json already exists for an open request, ask whether to replace it (starts a fresh track) or add to `completed` (continuing the same track).
