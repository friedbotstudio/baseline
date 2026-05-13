# Replace the harness_continuation freshness window with a session-scoped active-marker file

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The `harness_continuation` Stop hook (`.claude/hooks/harness_continuation.sh`) currently uses a five-rung silence ladder to decide whether to emit `decision: block` and force the model to invoke `Skill(harness)` on the same turn. Rung 4 of that ladder is a freshness check: `now - harness_state.written_at <= harness.continue_window_seconds` (default 10).

Empirical diagnosis across one full conversation:

- 21 hook fires logged in `.claude/state/logs/harness_continuation.log` since the workflow began.
- Exactly one in-turn auto-continuation succeeded (consecutive log entries 34 seconds apart on 2026-05-12 between 15:49:29Z and 15:50:03Z — that gap is the recursion-guard signature of a hook that emitted block and re-fired with `stop_hook_active: true`).
- Every other tick required the user to manually re-type `/harness`. Reason: the file write latency between `Bash date +%s` capture and the `Write` tool actually committing the file was 5-8 seconds, plus 1-3 seconds of streaming the terminal text, putting the hook's read of `now - written_at` consistently at 10-15 seconds — just outside the 10s window. The file would land "stale-by-one-second" almost every time.

The deeper problem is shape, not threshold. A TTL window is the right abstraction for one-time grants (consent markers like `.spec_approval_grant` with `consent.gate_marker_ttl_seconds: 120` — staleness means "the user's intent has expired"). A harness phase pointer is not a grant. It's persistent workflow state that's either authoritative for the *current* loop or it isn't, and "did this file get written in the last N seconds" is a poor proxy for "are we in the loop right now?" — the question the hook actually needs to answer.

The two failure modes the freshness window was supposed to address both collapse into "are we in the loop right now?":

- **Cross-session ghost resumption.** Day 1 ends with `state: continue`. Day 2 user types "hello". Hook reads disk, sees `continue`, emits block → model is force-resumed into a workflow the user may have abandoned. The fix isn't a wall-clock check; it's a session-boundary check.
- **Runaway loops.** A buggy harness writes `state: continue` indefinitely. The recursion guard (`stop_hook_active`) already bounds this within a single user turn. Cross-turn runaway is "the user keeps typing /harness and the skill misbehaves" — same as any skill bug.

A session-scoped marker file answers the right question directly, with no proxy.

## Goal

The Stop hook decides "should I emit block?" using a session-scoped active marker file plus the existing recursion guard plus the existing `state: continue` field — three rungs, no timestamps, no tick counters.

## Non-goals

- Transcript inspection alternatives (parse `transcript_path`, look for recent `Skill(harness)` calls). Surveyed in conversation and rejected as overengineering for a question a marker file answers directly.
- `session_id`-in-payload alternatives. Surveyed; technically usable but adds a dependency on Claude Code exposing `session_id` in the Stop payload. The marker approach is payload-independent.
- Any redesign of the consent-gate marker system (`.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`). Those TTLs are correct for one-time grants.
- Backward compatibility with the old 5-field `harness_state` shape. The hook will tolerate extra fields if present (forward compat), but no migration tooling is needed — `harness_state` is runtime state, not a versioned artifact, and is overwritten on every tick.
- A new SessionStart hook. The marker cleanup goes into the existing `memory_session_start.sh` as a small additional block.
- A `/harness --abort` slash command for user override. Not in scope; the user already has explicit control by typing any non-`/harness` slash command to stop auto-continuation, and the harness's preflight grounds the user on any cross-session resume.
- Concurrent-tick races. There is no real concurrency on this codebase; this is a non-concern.

## Success metrics

- In-turn chain success rate — baseline: 1 of 21 hook fires this session (≈5%), target: ≥ 90% of `state: continue` writes followed within one Stop event by an emitted block decision, measured via: count of consecutive log entries < 30s apart with `state: continue` in effect (the empirical signature of a successful chain).
- Cross-session ghost rate — baseline: not measured (window-based defense was flaky and time-dependent), target: 0% — Day-2 first turn of a conversation never auto-fires harness on a leftover `state: continue` from Day 1, measured via: explicit test that creates a stale `state: continue` + marker, starts a fresh session, asserts SessionStart cleaned the marker AND the hook stays silent.
- Hook code complexity — baseline: ~85 lines of bash + python3 in `harness_continuation.sh`, target: ≤ 50 lines, measured via: `wc -l .claude/hooks/harness_continuation.sh`. (Stretch goal — the simpler decision tree should reduce LOC.)
- `harness_state` shape — baseline: 5 fields (`state`, `reason`, `written_at`, `slug`, `tick_count`), target: 3 fields (`state`, `slug`, `reason`), measured via: spec's data-model class diagram + the harness skill's state-write code.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner; surfaced the design problem after observing repeated manual `/harness` interventions this session).
- **Reviewer**: razieldecarte@gmail.com (sole reviewer for this baseline).
- **Operator** (who runs it in prod): Every workflow that uses `/harness` autopilot. The skill-ownership workflow currently paused at task #15 is the first operator after this redesign lands — it will resume immediately via the new mechanism.

## Constraints

- All hooks remain bash + python3 (no jq, no Node) per baseline convention. Marker file ops are bash `[ -f marker ]`, `rm -f marker`, `echo "$slug" > marker` — no new tooling.
- The marker filename uses a dot prefix (`.harness_active`) to distinguish ephemeral runtime markers from durable state files (`workflow.json`, `harness_state`). This matches the convention already used by `.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`.
- Marker content is the workflow slug on a single line with trailing newline. The hook reads it for diagnostic sanity-checking against `workflow.json → slug`; mismatch is a WARN log line, not a hard fail.
- The marker lives under `.claude/state/`. That directory is already excluded from `npx create-baseline` overlay (runtime state never ships in the npm payload).
- File ops are atomic in the practical sense for this single-actor codebase. No locking. Idempotent: `echo > marker` is touch-or-overwrite; `rm -f marker` is no-error-if-absent.
- The audit-baseline test (the project's binding `test.cmd`) must continue to exit 0 on a clean post-edit tree.
- Existing in-turn chain success (the one observed in the diagnosis) must not regress. The recursion guard mechanism stays unchanged.
- The `harness_state` JSON shape change is forward-compatible: the hook reads only `state`, ignoring unknown fields, so an old-shape file from before the redesign still parses correctly.
- `harness_state` is small (< 200 bytes). The marker is small (< 50 bytes). No resource concerns.

## Acceptance criteria

1. Given the harness skill writes `harness_state` with `state: "continue"`, when the write completes, then `.claude/state/.harness_active` exists with contents `<slug>\n` (the workflow slug followed by one newline) and no other content.
2. Given the harness skill writes `harness_state` with `state: "yield"` (for any reason — consent gate, integrate-failure-needs-spec-change, workflow done, phase failure), when the write completes, then `.claude/state/.harness_active` does not exist on disk.
3. Given a SessionStart event fires on Claude Code session boundary, when `memory_session_start.sh` runs, then any pre-existing `.claude/state/.harness_active` is removed (`rm -f`), regardless of its contents.
4. Given `harness_state.state == "continue"` AND `.claude/state/.harness_active` exists AND payload `stop_hook_active` is absent/false, when `harness_continuation.sh` runs, then it emits `{"decision":"block","reason":"…invoke Skill(harness)…"}` to stdout and exits 0.
5. Given `harness_state.state == "continue"` AND `.claude/state/.harness_active` does NOT exist (e.g., post-SessionStart but state file lingered), when the hook runs, then it stays silent (exits 0 with no stdout JSON).
6. Given `harness_state.state == "yield"` (any state other than `continue`) AND `.harness_active` absent, when the hook runs, then it stays silent.
7. Given payload `stop_hook_active: true`, when the hook runs, then it stays silent regardless of `.harness_active` and `harness_state.state` values.
8. Given `.harness_active`'s content (its slug) does not match `workflow.json → slug`, when the hook runs, then it writes one `WARN slug mismatch: marker=<x> workflow=<y>` line to `.claude/state/logs/harness_continuation.log` AND continues with the three-rung decision unchanged (mismatch does not flip the decision).
9. Given the harness skill writes `harness_state`, when the file is inspected, then it contains only the keys `state`, `slug`, `reason` (no `written_at`, no `tick_count`).
10. Given the redesign has shipped, when `.claude/project.json` is parsed, then `harness.continue_window_seconds` and `harness.max_ticks_per_session` are absent. `src/project.template.json` is updated to match. `audit-baseline`'s project.json key-presence check is updated to expect their absence.
11. Given a clean dev tree post-edit, when `bash .claude/skills/audit-baseline/audit.sh` runs, then it exits 0 with no FAIL rows. (Binding regression check.)
12. Given two consecutive Stop events within a single user turn (first fire without `stop_hook_active`, second fire with `stop_hook_active: true`), when the hook runs on each, then the first emits block and the second stays silent — preserving the in-turn chain that already works.

## Open questions

- Rung ordering inside the hook: marker-present check first vs `state == continue` check first. Both lead to silent in the failure case; the order affects diagnostic clarity (which rung "ate" the decision). Intake position: marker first (cheap `stat`), state second (file read + JSON parse).
- Should `memory_session_start.sh`'s marker cleanup log a line to the continuation log when it actually removes a stale marker? Useful audit trail. Intake position: yes, one line `"<ts>  INFO  SessionStart removed stale .harness_active (slug=<x>)"` — only when removal happens, not on every fire.
- Marker content format — slug on line 1 only (`<slug>\n`) vs slug + timestamp (`<slug>\t<epoch>\n`). The timestamp would be diagnostic-only, never read by the hook for decisioning. Intake position: slug only; if we want a timestamp later, we add it without breaking the read.
- When the harness yields with `reason: "<phase> failed: <summary>"`, should the marker still be deleted? The harness is stopping for user inspection, so yes — marker deletion is correct because we're not "in the loop" anymore. Intake position: confirmed; the `state: yield` write always deletes the marker, regardless of why we yielded.
- Should the audit's check for `harness_state` shape (if any exists today) be updated to assert only 3 fields, or stay shape-permissive? The audit's job is drift detection; if `harness_state` is runtime state (not source), the audit shouldn't care about its shape at all. Intake position: audit ignores `harness_state` shape entirely; the harness skill's own write is the source of truth.
- Should this redesign also harmonize `state: "yielded"` → `state: "yield"` (drop the past-participle since "yield" is more imperative for a state pointer)? The codebase currently uses `yielded` and `done`. Intake position: keep `yielded` and `done` as-is to minimize migration; only the freshness mechanism changes, not the state-value vocabulary. (Spec may revisit if it wants the simpler 2-state model the user mentioned.)
