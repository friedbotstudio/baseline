# State machine — `.claude/state/design/<slug>.json`

`design-ui` persists every orchestration to `.claude/state/design/<slug>.json`. The file is the resume point: a second invocation with the same `slug` reads the file, finds `step_index`, and continues from there without re-running completed steps.

## File location

`.claude/state/design/<slug>.json` — one file per orchestration, keyed by `slug`. The directory is gitignored (the whole `.claude/state/` tree is) so state files are local-only.

The first invocation creates the directory if it does not exist (`mkdir -p`). Subsequent invocations write atomically (write to a tmp file, then rename). On read, malformed JSON triggers `state: "blocked"` with `reason: "state file is malformed"`.

## File shape

```jsonc
{
  "slug":         "<kebab-case>",
  "started_at":   "<ISO 8601 UTC>",
  "updated_at":   "<ISO 8601 UTC>",
  "intent":       "<the natural-language intent from task_brief>",
  "register":     "brand" | "product",
  "recipe":       ["<impeccable_cmd>", ...],
  "step_index":   <int, 0-based; index of the NEXT step to run>,
  "invocations":  [InvocationRecord, ...],
  "verifications": [VerificationRecord, ...],
  "state":        "in_progress" | "complete" | "needs_human" | "blocked" | "not_a_design_task" | "mixed_brief",
  "next_actions": ["<human-readable action>", ...]
}
```

### `InvocationRecord`

One record per `Skill(impeccable, ...)` call:

```jsonc
{
  "cmd":          "shape",            // impeccable subcommand name
  "iteration":    1,                  // 1 for non-loop steps; counter inside polish atoms
  "started_at":   "<ISO 8601 UTC>",
  "completed_at": "<ISO 8601 UTC>",
  "output_path":  "docs/design/<slug>.brief.md" | null,
  "files_written": ["<path>", ...]
}
```

### `VerificationRecord`

One record per `audit` or `critique` invocation. These also appear in `invocations[]`; this list collates them for quick access:

```jsonc
{
  "cmd":         "audit",
  "iteration":   2,                   // matches the iteration in invocations[]
  "score":       "17/20",
  "p0":          0,
  "p1":          2,
  "report_path": "docs/design/<slug>.audit.md"
}
```

## Required fields

Every state file MUST carry these fields. Stage 3's checkpoint writes them all on each step. The audit-baseline check `state-file: shape` (if added) verifies their presence on any state file under `.claude/state/design/`.

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | The state file's basename. Self-referential check. |
| `started_at` | yes | When the orchestration began. Never updated on subsequent steps. |
| `intent` | yes | The natural-language intent. Used in resume to confirm the user is resuming the same orchestration. |
| `recipe` | yes | The full step sequence. Set at Stage 2; never mutated. |
| `step_index` | yes | The position to resume from. 0 = nothing run yet; N = N steps completed. |
| `invocations` | yes | Append-only list. Each step's invocation appears here. |
| `verifications` | yes | Subset of invocations[] limited to evaluation steps (audit, critique). |
| `state` | yes | One of the six terminal/transitional states. |

Optional fields:
- `register`, `updated_at`, `next_actions` — present when the orchestration has produced them; absent before Stage 1 completes the capture.
- `register_override`, `references`, `target_files`, `write_set` — echoed from the task_brief for traceability; not required.

## Terminal states

The six values of `state` and their meaning:

| State | Meaning | Caller action |
|---|---|---|
| `in_progress` | Orchestration is mid-flight. Either Stage 3 is running or the session ended mid-step. | Resume on next invocation. |
| `complete` | All recipe steps ran to completion. Final audit/critique passed thresholds. | Read `Report` and continue. |
| `needs_human` | Loop cap fired (3 iterations on audit→polish or critique-driven refine). P1 issues remain unresolved. | Caller decides whether to surface and stop, or warn and continue. Per `/tdd` Step 6 policy: warn and continue. |
| `blocked` | A gate fired. P0 blockers, register conflict declined, target_files parent missing, malformed state file, user refused recipe. | Caller surfaces the reason and stops the immediate flow. |
| `not_a_design_task` | Stage 0 classified the intent as development or copy. Set on the first checkpoint write of the orchestration. | Caller routes to `correct_lane` (`/tdd` or `/document`). |
| `mixed_brief` | Stage 0 classified the task_brief as spanning ≥ 2 lanes (multi-lane misroute). Set on the first checkpoint write of the orchestration; `lane_split` is persisted alongside. | Caller reads `lane_split` and fans out per row; see `references/orchestration.md` caller-policy. |

## Resume logic

On any `Skill(design-ui, task_brief)` invocation:

1. Compute the slug (from `task_brief.slug`, or derive from `task_brief.intent` per the kebab-case-first-noun-phrase rule from `/intake`).
2. Look for `.claude/state/design/<slug>.json`:
   - **Not present** → fresh orchestration. Start Stage 0.
   - **Present and `state` is `complete`** → return the existing Report; no work to redo.
   - **Present and `state` is `in_progress`** → resume. Skip steps prior to `step_index`; start at `step_index`.
   - **Present and `state` is `needs_human`** → caller must signal intent to resume. If `task_brief` is identical to the stored intent and the caller is re-invoking explicitly, restart the loop from `step_index` (which points at the audit that fired the cap). The user is asserting that conditions have changed (e.g., P1 issues were addressed externally) and the loop should re-run.
   - **Present and `state` is `blocked`** → return the existing Report with the blocker reason. User must materially change the input (re-state intent, expand write_set, etc.) before progress.
   - **Present and `state` is `not_a_design_task`** → return the existing Report; the misroute is sticky for this slug.
   - **Present and `state` is `mixed_brief`** → return the existing Report (including the cached `lane_split`); the misroute is sticky for this slug (mirrors `not_a_design_task`). Delete the state file to re-classify.
   - **Present but malformed JSON** → return `Report { final_state: "blocked", reason: "state file malformed", state_file }`. Do NOT overwrite — preserve for human inspection.

The resume rule: **skip steps prior to `step_index`; start at `step_index`**. Completed steps are never re-run unless the user explicitly requests it (e.g., by deleting the state file and re-invoking).

## Atomic writes

The state file is written via tmp-then-rename:

```
1. write .claude/state/design/<slug>.json.tmp.<pid>
2. rename .tmp.<pid> → .json
```

This prevents partial-write corruption if the process is killed mid-write. Readers always see either the old version or the complete new version.

## What the state file is NOT

- Not a transcript of impeccable's design decisions — those live in `docs/design/<slug>.brief.md` and `<slug>.audit.md` (snapshots design-ui materializes from impeccable's returns).
- Not a log — `_resume.md` carries the session-level continuity snapshot. The state file is specific to one orchestration.
- Not user-readable as the primary surface — humans should read the brief and audit reports under `docs/design/`. The state file is the machine-readable resume point.

## Related skill memory entry

The `audit-baseline` skill checks that this state-machine documentation is present and aligned with any rule it enforces. If a future audit check verifies state-file shape on disk, it parses `.claude/state/design/*.json` and asserts the required fields above are present.
