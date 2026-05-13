# Pattern Research — harness-auto-continuation

Phase 3 research for the harness auto-continuation refactor. Resolves the seven Open Questions captured in `docs/intake/harness-auto-continuation.md`. The /spec author should be able to lift the recommendations into the spec verbatim.

## Source-of-truth note

For OQ-1 (Stop hook contract), this memo cites Anthropic Claude Code documentation as the authoritative source — not training-data recall. URLs are inline. For OQ-2 through OQ-7, recommendations are grounded in the existing repo's patterns (cited as `path:line` per the scout) and on the OQ-1 finding.

The Stop hook contract investigation was delegated to a dedicated `claude-code-guide` subagent run on 2026-05-12; its findings are summarized below with the source URLs it returned.

---

## OQ-1: Stop hook decision contract

### What the docs actually say

Sources cited by the `claude-code-guide` subagent:
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Hook Development SKILL.md (anthropics/claude-code GitHub)](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)

The Stop event hook returns a JSON object on stdout. The documented fields:

| Field | Effect |
|---|---|
| `decision: "block"` | Claude continues running the same turn (turn does NOT end). `reason` is required and is presented to Claude as the instruction for what to do next. |
| `reason: "<text>"` | The continuation instruction Claude reads when `decision: "block"`. |
| `continue: false` | Stops the session entirely. Takes precedence over `decision`. |
| `stopReason: "<text>"` | Message displayed when `continue: false`. |
| `hookSpecificOutput.additionalContext: "<text>"` | Context injected into Claude's NEXT turn. The next turn requires a user prompt to fire — this is NOT auto-continuation. |

### What this means for our design

The mechanism the user originally chose (Option 1: "Stop hook re-fires `/harness` autonomously, with no user input between phases") **is not directly supported by Claude Code's hook contract.** Stop hooks cannot auto-invoke slash commands; they cannot trigger a fresh turn without user input.

What IS supported — and serves the same goal — is `decision: "block"`. When the Stop hook emits `{"decision": "block", "reason": "<instruction>"}`, Claude keeps running on the same turn and reads `<instruction>` as a directive for its next tool call. This is the mechanism the community uses for hook-driven workflow continuation.

The user's original concern about "Option 2 (in-turn block-decision) inherits the parent-SOP-resume problem" still applies — IF the parent SOP itself has multiple steps after a `Skill(...)` call. Our refactor sidesteps that risk by structuring **each harness tick as a single `Skill(...)` invocation followed by a state-file write**. There is no "remaining parent steps" problem because the harness's own SOP per tick is one Skill call + one state write + return.

### `stop_hook_active` field

The input payload to a Stop hook reportedly carries a `stop_hook_active` boolean flag. The `claude-code-guide` agent found references in community sources but could not confirm the field's semantics from Anthropic's official docs. The standing community interpretation: when a previous Stop hook in the same turn emitted `decision: "block"`, the field is set to `true` on the next Stop hook invocation as a guard against infinite loops. Hooks SHOULD honor it — if `stop_hook_active: true`, emit no decision and let the turn end normally.

Our design treats this as a belt-and-suspenders: even if `stop_hook_active` is missing or unreliable, our own `harness_state.tick_count` field caps continuations at a configurable maximum (default: 20 ticks per session — well above any realistic workflow but below any runaway).

### SubagentStop event (clarification)

The investigation confirmed that the `SubagentStop` event fires on **Task / Agent tool** completion (the `Agent` tool that spawns a subagent) — **not** on `Skill` tool completion. So `SubagentStop` does NOT help with the parent-skill-invokes-child-skill case that triggered Q-003.

### `disable-model-invocation: true` (confirmation)

Confirmed: `disable-model-invocation: true` excludes a skill from Claude's skill listing and prevents `Skill(...)` tool invocations. Setting to `false` (or omitting) makes the skill model-invocable while preserving user-invocability via the slash command.

### Recommendation (OQ-1)

**Use `decision: "block"` with a directive `reason`.** Concretely:

```
{
  "decision": "block",
  "reason": "Workflow continuing: the next pending phase is <phase>. Invoke Skill(harness) to advance."
}
```

Treat the same-turn semantics as a feature, not a bug — it eliminates the cross-turn fragility we'd have inherited from "Option 1 (Stop-hook re-fire on next turn via additionalContext)." Mitigate the parent-SOP-resume risk by making each harness tick atomic (one `Skill(phase)` call per tick, plus the state-file write, plus an end-of-tick message).

What would flip the decision: if Anthropic published a way for Stop hooks to programmatically invoke a slash command on a fresh next turn (not currently supported), we'd switch to that mechanism for the cleaner per-turn cadence.

---

## OQ-2: `harness_state` file shape

### Candidates

**Candidate A — Minimal flat JSON, TTL in `project.json`:**

```json
{
  "state": "continue" | "yielded" | "done",
  "reason": "<one sentence>",
  "written_at": <epoch>,
  "slug": "<slug>",
  "tick_count": <monotonic int>
}
```

`project.json → harness.continue_window_seconds` (default: 10) caps how long a `state: "continue"` is honored. `project.json → harness.max_ticks_per_session` (default: 20) caps cumulative continuations.

**Candidate B — Embedded TTL, no project.json key:**

Same JSON shape, plus `ttl_seconds: 10` inline. Avoids project.json schema growth.

**Candidate C — Without slug field (single-workflow assumption):**

Same as A but drops `slug`. Acceptable today since only one workflow is open at a time per project; risky if that assumption ever changes.

### Recommendation (OQ-2)

**Candidate A.** Slug is cheap insurance against ever supporting concurrent workflows (it also gives the Stop hook a way to cross-check against `workflow.json → slug` and refuse to fire on a stale state file). `tick_count` is the runaway-loop cap. TTL lives in `project.json → harness` for tunability without code changes.

What would flip the decision: if `project.json` schema growth becomes a concern (it's already 11 top-level keys), drop to Candidate B with the TTL inline.

---

## OQ-3: "Did `Skill(harness)` just run" detection

### Candidates

**Candidate A — Transcript walk (read `transcript_path` from hook payload, find latest assistant message, inspect `tool_use` blocks).**

- Pro: directly observes what happened.
- Con: parse cost. `memory_stop.sh:64-100` already walks the full transcript every Stop event. Adding a second walk in `harness_continuation.sh` doubles the cost. For 15 MB+ session files the budget pressure is real (Claude Code default hook timeout is 60 s; community reports flag >50 MB transcripts as problematic).

**Candidate B — Per-tick marker file written by harness.**

- Harness writes `.claude/state/.harness_tick` on every tick. Stop hook reads it and deletes it. If present + fresh, fire; if missing, silent.
- Pro: O(1) check, no transcript walk.
- Con: extra state file; harness must always clean it up on yield paths (easy to forget).

**Candidate C — `harness_state.written_at` freshness as proxy.**

- Stop hook reads `harness_state`. If `state == "continue"` AND `written_at` is within `harness.continue_window_seconds` (default 10) of `date +%s`, fire. Else silent.
- Pro: uses state we're already writing; no extra file; freshness gates loops naturally.
- Con: if Claude makes a non-harness tool call AFTER harness writes state but BEFORE the turn ends, the window check could fire incorrectly. Practically, the harness's tick is structured as "Skill(phase); write state; emit terminal message" — there's no opportunity for a non-harness tool call to slip in.

### Recommendation (OQ-3)

**Candidate C, with `stop_hook_active` as a second-line check.** The hook reads `harness_state` and decides:
1. If the input payload has `stop_hook_active: true`, emit no decision (let the turn end). Belt-and-suspenders against runaway loops.
2. Else read `harness_state`. If absent or unparseable, silent.
3. Else if `state != "continue"`, silent.
4. Else if `(now - written_at) > harness.continue_window_seconds`, silent (state is stale; harness may have crashed mid-tick).
5. Else if `tick_count >= harness.max_ticks_per_session`, silent + log a warning (runaway guard).
6. Else emit `{"decision": "block", "reason": "<directive>"}`.

What would flip the decision: if testing reveals that `harness_state.written_at` race conditions are common (e.g., the file's mtime drifts due to filesystem oddities on macOS), fall back to Candidate B (explicit marker file).

---

## OQ-4: Hoisted-worker task creation timing

### Candidates

**Candidate A — `/tdd` coordinator creates the worker tasks at its turn-end, then sets `harness_state: "continue"` and yields.**

- Consistent with `triage/SKILL.md:32` — triage seeds the full workflow TaskList atomically.
- `/tdd` is the only context that knows the recipe + contract; it's the natural place to enumerate worker tasks.

**Candidate B — Harness creates worker tasks on the NEXT tick after reading `/tdd`'s state file.**

- Harness becomes the sole TaskList writer for mid-workflow expansions.
- Requires `/tdd` to write a state file describing the workers; harness then reads it and creates tasks.

### Recommendation (OQ-4)

**Candidate A.** It mirrors the existing triage-seeds-everything pattern, keeps state-file growth to a minimum (only `harness_state` is added; no `tdd_handoff.json`), and respects the principle that the skill closest to the decision is the one that records it.

What would flip the decision: if `/tdd`'s coordinator step grows past ~30 lines of task-creation logic, moving it to harness keeps `/tdd` thin.

---

## OQ-5: Phase ordering for hoisted workers

### What the existing constraint actually is

`track_guard.sh` (scout line: `.claude/hooks/track_guard.sh`) reads `project.json → workflow.phases` as the canonical order and enforces "phase N+1 requires phase N in `completed` (or `exceptions`)". The current phase list is the 11 phases from CLAUDE.md Article IV:

```
intake, brd, scout, research, spec, tdd, simplify, security, integrate, document, archive, commit
```

(plus the alt-track `chore`.)

### Candidates

**Candidate X — Hoisted workers appear in `workflow.json → completed` individually.**

- Phase list grows: `..., spec, scenario, implement, verify, design-ui, simplify, security, ...`
- `track_guard.sh` enforces ordering of all of them.
- Pro: finest-grained workflow.json visibility.
- Con: phase-ordering rigidity collides with conditional worker invocations (e.g., design-ui only runs when ui_globs intersect; verify can run multiple times per RALPH iteration). The current model handles this implicitly because everything happens inside `tdd`.

**Candidate Y — Only `tdd` appears in `workflow.json → completed`. Workers are TaskList entries only.**

- Phase list stays the same.
- `track_guard.sh` still works.
- Worker progression is tracked at the TaskList level (which already has rich dependency / status semantics).
- Workflow.json captures phase milestones; TaskList captures sub-phase granularity.

### Recommendation (OQ-5)

**Candidate Y.** Workflow.json's purpose is to track major phase milestones the cross-session harness needs for "where did I leave off" reasoning. TaskList already gives the granular per-worker state. Bringing the workers into `workflow.phases` would force `track_guard.sh` to model conditional / iterative invocation (design-ui's iteration cap, verify's multi-call within RALPH), and the current phase model isn't built for that.

What would flip the decision: if a future workflow needs to *resume* mid-`/tdd` after a session restart (e.g., the user `/clear`d during a long implement phase), Candidate X gives finer-grained resume points. Today, `/tdd` is fast enough that mid-phase resume is unusual.

---

## OQ-6: `verify` backward-compatibility

### Candidates

**Candidate A — Keep `verify/SKILL.md` as a callable shim that emits a deprecation notice.**

- Pro: existing references (any out-of-tree caller, future user-facing slash commands) continue to work.
- Con: the shim itself renders a terminal text block and re-introduces the parent-SOP-resume pause we're fixing. Defeats the purpose.

**Candidate B — Remove `verify` from `EXPECTED_SKILLS`; delete `verify/SKILL.md`.**

- Pro: clean break, count discipline tight.
- Con: many existing references (CLAUDE.md Article VIII, seed.md §4.3, README.md, audit-baseline counts) need lockstep edits. The slug `verify` is well-known and removing it means future contributors hunt for the canonical statefile format.

**Candidate C — Keep `verify/SKILL.md` as a contract-only document; flip its frontmatter to `disable-model-invocation: true`.**

- Pro: preserves `EXPECTED_SKILLS` discipline (skill count unchanged at 36); the file remains the canonical reference for the `last_test_result` format that inlined callers must reproduce. Frontmatter flip makes it un-callable via the Skill tool, so the pause-prone Skill invocation pattern can't return by accident.
- Description rewrites to: "Contract document for the binding test verdict written to `.claude/state/last_test_result`. Format spec below. Callers inline the read + run + write; this skill is not Skill-tool-invocable (`disable-model-invocation: true`). The `verify_pass_guard` hook reads line 1 of the statefile as the single source of truth."

### Recommendation (OQ-6)

**Candidate C.** Keeps the count cascade short (only `harness_continuation` hook addition cascades through audit), preserves the canonical format reference inside the file most likely to be consulted, and structurally prevents accidental reintroduction of the Skill-call pause.

What would flip the decision: if a future stack-specific recommendation actually wants a callable verify (e.g., a stack where verify's command is so complex it needs a dedicated skill body), revisit by flipping the frontmatter back.

---

## OQ-7: Eat-your-own-dogfood test plan

The strongest validation is observing this very workflow (`harness-auto-continuation`) run on the post-refactor harness during its own `/integrate` phase.

### Observable signals

**AC-001 evidence (cross-phase auto-continuation works):**

- After `/integrate` writes `harness_state: "continue"` and emits its terminal text, the immediately-following content in the session transcript MUST be Claude's next tool call (specifically `Skill(harness)`), NOT a user message.
- Concrete grep: from the session JSONL, find the assistant message that completes `/integrate`, then walk forward — the next event MUST be either an assistant `tool_use` block or another assistant content block, NOT a `type: "user"` with `role: "user"` content.

**AC-002 evidence (gate yield works):**

- At the `/approve-spec` gate (the only gate in this slug's run, since `/grant-commit` is excepted), the `/spec` phase MUST write `harness_state: "yielded"` and the Stop hook MUST be silent.
- Concrete grep: after `/spec` completes, the next event in the transcript IS a `type: "user"` event — the user's manually-typed `/approve-spec harness-auto-continuation`. Until that prompt, no further assistant work occurs.

**AC-009 evidence (no within-phase pauses):**

- Count `type: "user"` events in the post-refactor run from `/intake` through `/archive`, excluding the consent-gate prompts and excluding the final "I'm done reviewing" type prompts.
- Expected: exactly one consent-gate prompt (`/approve-spec harness-auto-continuation`).
- Tolerable: optional user-volunteered review prompts between phases ("show me the spec before continuing") count as user-initiated, not as the bug we're fixing.

### Test artifact

The `.claude/state/harness/harness-auto-continuation.log` file already records per-phase entries. After the refactor, every phase transition's entry has an adjacent `harness_state` write captured in the timestamps. A simple awk over the log + `harness_state` snapshots can compute the "ticks per session" metric.

### Recommendation (OQ-7)

**Capture the test plan as a section in the spec under "Test plan / Evidence."** The integrate phase of this slug becomes both the implementer's validation and the canonical regression test for AC-001/AC-002/AC-009. Make the assertions mechanical (grep over the session JSONL produced by this run), so a future contributor can re-run the same evidence collection.

What would flip the decision: if observing the session JSONL inside an active session proves unreliable (e.g., the file isn't flushed to disk fast enough for in-run reads), fall back to a post-session script analyzing the closed JSONL.

---

## Secondary research items

### Stop hook timeout / budget

- Claude Code default hook timeout: **60 seconds** (configurable via settings.json).
- Known issue: **transcripts > 50 MB cause memory issues** (community-reported; not from Anthropic docs).
- Mitigation for our hook: do NOT walk the transcript. Use the harness_state file. The hook should complete in single-digit milliseconds.

### Subagent context

- `Skill(...)` invocations do not run in a subagent context unless the skill declares `context: fork` (none of our skills do).
- The `Stop` hook does NOT fire on `SubagentStop`; they are separate events.
- For `swarm-dispatch` workers (the only baseline subagent), `SubagentStop` would fire — but those workers do not invoke `Skill(harness)`, so the new hook would always see `stop_hook_active != true` AND `harness_state` absent or stale, and stay silent.

---

## Recommended design (lift into the spec)

For each OQ, the recommended approach (lift verbatim into the spec):

| OQ | Recommendation |
|---|---|
| OQ-1 | Stop hook uses `decision: "block"` + `reason: "<directive>"` to continue the same turn. Reason instructs Claude to invoke `Skill(harness)`. Each harness tick is atomic (one `Skill(phase)` + one `harness_state` write + return) to sidestep the parent-SOP-resume problem. |
| OQ-2 | `harness_state` is flat JSON: `{state, reason, written_at, slug, tick_count}`. TTL + max-ticks live in `project.json → harness`. |
| OQ-3 | Detection: Stop hook reads `harness_state`. Five-rung silence ladder (`stop_hook_active` → file presence → state value → freshness → tick_count cap) before emitting block. |
| OQ-4 | `/tdd` coordinator creates worker tasks (scenario / implement / verify / design-ui) at its turn-end, mirrors triage's atomic-task-seeding pattern. |
| OQ-5 | Workers appear in TaskList only. `workflow.json → completed` keeps the existing 11-phase model. |
| OQ-6 | `verify/SKILL.md` becomes contract-only with `disable-model-invocation: true`; remains in `EXPECTED_SKILLS`. Callers inline the 4-line statefile write. |
| OQ-7 | Eat-your-own-dogfood: this slug's `/integrate` phase IS the validation. Test plan in the spec asserts session JSONL has zero non-gate user prompts. |

---

## Open questions for `/spec`

Issues research could not fully close — the spec author needs to decide:

- **`harness_continuation_grace_seconds` default.** Research recommends 10 s; spec should confirm whether the value is project-tunable from day one or hardcoded for now (YAGNI argues hardcoded; the project.json schema already supports the key without strain).

- **Article V wording precise rewrite.** Research identifies the contract change (no longer "user-only") but does not draft the new prose. Spec drafts the replacement paragraph; `/document` polishes.

- **`tdd-step-6.test.mjs` post-decomposition shape.** Research recommends Candidate A (TaskList-only worker tracking) for OQ-5; spec must specify what the test asserts (mid-workflow TaskList growth? Per-worker harness-log entries?) given that the test's current assertions target `/tdd`'s in-skill invocations.

- **Failure mode handling for harness_state writes.** What does `/integrate` (or any phase) do if it cannot write `harness_state` (e.g., disk full)? Research treats this as a silent fall-back to manual-resume; spec should declare the exact behavior — probably "skill returns normally; user prompted to continue manually."

- **README.md and seed.md text-level edits.** Research enumerates the count bumps (21 → 22 hooks; "3 lifecycle hooks" → "4 lifecycle hooks"); spec / document should confirm there are no other prose mentions that need lockstep updates.
