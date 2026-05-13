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
2. **Git-repo detection (mandatory).** Run `git rev-parse --is-inside-work-tree 2>/dev/null` at the project root. If the exit status is non-zero, the project is not a git repository: gate C / `commit` are inapplicable AND the swarm path is unavailable because worktree isolation (the swarm contract's physical safety mechanism) requires git (CLAUDE.md Article IV "Phase 6c and Phase 11 are git-conditional", Article VII). Append `"swarm-plan"`, `"approve-swarm"`, `"swarm-dispatch"`, `"grant-commit"`, and `"commit"` to the exceptions array you'll write in step 4. Tell the user: "Non-git project detected — `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, and `commit` auto-excepted. Phase 6 routes to solo `/tdd`. Workflow ends after `/archive`. Persistence outside git is your responsibility."
3. If the user has not confirmed yet, ask: "Entry phase = <X>. Exceptions = <Y>. Proceed? (or tell me a different entry)"
4. On confirmation, write `.claude/state/workflow.json`:
   ```json
   {
     "request": "<the request>",
     "entry_phase": "<intake|spec|tdd|chore>",
     "exceptions": ["<phase>", ...],
     "completed": [],
     "created_at": <epoch>,
     "updated_at": <epoch>
   }
   ```
5. **Seed the workflow tasklist.** Use the `TaskCreate` tool to register one task per non-excepted phase plus each applicable consent gate. The tasks are the running checklist that `/harness` (or any direct phase invocation) reads to decide the next action; consent-gate tasks block the workflow until the user runs the corresponding command. **When `grant-commit` and `commit` are in exceptions (non-git project), do NOT seed those two tasks** — the workflow ends after `/archive`. Use these canonical templates:

   **For `chore` track** (single phase + commit gate):
   - `Run /chore for <slug>` — activeForm: "Running chore", metadata: `{"phase": "chore"}`
   - `Wait for /grant-commit` — metadata: `{"phase": "grant-commit", "needs_user": true}`, addBlockedBy previous
   - `Run /commit for <slug>` — activeForm: "Running commit", metadata: `{"phase": "commit"}`, addBlockedBy previous

   **For `tdd`-entry quickfix track** (skip intake/scout/research/spec/review):
   - `Run /tdd`, `Run /simplify`, `Run /security` (only if not in exceptions), `Run /integrate`, `Run /document`, `Run /archive`, `Wait for /grant-commit` (`needs_user`), `Run /commit` — each with `addBlockedBy` set to the previous task's id.

   **For `spec`-entry track** (skip upstream): start from `Run /spec`, then `Wait for /approve-spec <path>` (`needs_user`), then continue per the full track.

   **For `intake`-entry full track**: `Run /intake`, `Run /brd` (only if stakeholder-heavy), `Run /scout`, `Run /research`, `Run /spec`, `Wait for /approve-spec <path>` (`needs_user`), `Run /tdd` OR (`Run /swarm-plan`, `Wait for /approve-swarm <slug>` (`needs_user`), `Run /swarm-dispatch`), `Run /simplify`, `Run /security` (unless excepted), `Run /integrate`, `Run /document`, `Run /archive`, `Wait for /grant-commit` (`needs_user`), `Run /commit`. **On non-git projects the swarm branch SHALL NOT be seeded** — only `Run /tdd` goes in the list, regardless of expected component count. Swarm-vs-solo is a Phase-6 main-context decision (per CLAUDE.md Article V) only on git projects; non-git workflows resolve to solo at triage time because `swarm-plan`, `approve-swarm`, and `swarm-dispatch` are already in `exceptions`.

   For every task: `subject` is imperative ("Run /scout for <slug>" / "Wait for /approve-spec <path>"); `description` names the phase + the slug; `metadata.phase` carries the phase name; consent-gate tasks set `metadata.needs_user: true`. Wire `addBlockedBy` so each task blocks until its predecessor completes — this surfaces the workflow's true dependency graph and prevents `/harness` from racing past a gate.

6. Tell the user the next concrete step to run: e.g. `/intake`, `/spec`, `/tdd`, `/chore`, or `/harness` to autopilot.

# Constraints

- NEVER skip triage by guessing from filename or diff alone. The user's natural-language framing is the primary signal.
- The Track Guard reads `entry_phase` and `exceptions`. If the user wants to skip an optional phase (e.g. `security`), add it to `exceptions` — do not silently re-order `workflow.phases` in project.json.
- If a workflow.json already exists for an open request, ask whether to replace it (starts a fresh track) or add to `completed` (continuing the same track).
