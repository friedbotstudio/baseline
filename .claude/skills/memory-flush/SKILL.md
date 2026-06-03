---
name: memory-flush
owner: baseline
description: Review the auto-extracted candidates in `.claude/memory/_pending.md` and commit keepers to the canonical memory files (`landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `pending-questions.md`, `backlog.md`). Invoke at session start when the SessionStart hook reports pending candidates, or any time `_pending.md` has accumulated entries you want to curate. Reset the pending body after flushing.
---

# When invoked as Phase 10.6

This skill runs as **Phase 10.6** of every workflow track (intake / spec / tdd / chore), between `/archive` (Phase 10.5) and `/grant-commit` (Phase 11). The harness loop reads `.claude/memory/_pending.md` body, runs Step 0 canonical sweeps unconditionally, and on **empty pending** (zero `## CANDIDATE:` blocks) short-circuits the **fast-path**: Steps 1–5 are skipped, Step 6 emits a one-line "no pending candidates" report, and the skill returns success. This keeps the no-op cost bounded at ≤ 3 sweep.mjs invocations per Phase 10.6 invocation.

The skill is also user-invokable outside the workflow (ad-hoc curation). When invoked ad-hoc and `_pending.md` is non-empty, the full Steps 1–5 flow runs identically. The fast-path activates per-invocation based on `_pending.md` body state, not on workflow context.

`/commit` (Phase 11) refuses to proceed unless `memory-flush` is in `workflow.json → completed` (or in `exceptions`). Empty-pending fast-path still appends `"memory-flush"` to `completed` — the prereq is satisfied either way.

(See "Method" below for the full Step 0 / Steps 1–5 / Step 6 flow.)

# memory-flush — curate auto-extracted memory candidates

The `memory_stop.mjs` hook appends candidates to `.claude/memory/_pending.md` after every turn. This skill reviews them in main context (where conversation richness is preserved), commits the keepers to the right canonical file with proper metadata, and resets the pending body.

The hook is a passive collector. **You are the curator.** Discard noise, promote signal, deduplicate against existing canonical entries.

# Inputs

- `.claude/memory/_pending.md` — the pending body. Each block looks like:
  ```
  ## CANDIDATE: <key> → <target-file>.md
  - field: value
  - field: value
  ```
- The seven canonical files at `.claude/memory/<name>.md`. Read each before deciding where a candidate lands and whether it duplicates existing content.

# Method

## Step 0 — Canonical sweep (closure semantics)

Before reviewing `_pending.md`, sweep the seven canonical files for closed entries and stale entries. The `sweep.mjs` helper at `.claude/skills/memory-flush/sweep.mjs` is the deterministic actuator; this SOP composes the three modes.

### Step 0a — Auto-close structured closure fields

Invoke:

```
node .claude/skills/memory-flush/sweep.mjs --mode auto-close --memory-dir .claude/memory
```

Behavior:

- For each entry on `pending-questions.md`: if `- resolved-at: <ISO>` is present and valid, delete the entry block.
- For each entry on the other five canonical files: if `- superseded-at: <ISO>` is present and valid, delete the entry block.
- Per-file invariant violations (`resolved-at:` on a non-pending file, `superseded-at:` on `pending-questions.md`) are flagged in the report and the block is **kept**.
- Malformed ISO dates are flagged and the block is **kept**.

Report shape: `{"closed": N, "malformed": [...], "invariant_violation": [...]}`. Surface counts in the Step 6 report.

### Step 0b — Surface prose closure phrases

Invoke (one reply per surfaced entry, piped from stdin):

```
node .claude/skills/memory-flush/sweep.mjs --mode prose-scan --memory-dir .claude/memory
```

For each entry without a structured closure field, the helper scans the body against four anchored, case-insensitive regexes (R1 `Resolution path taken|by|date`, R2 `Superseded by|at|on`, R3 `Resolved by|on|at`, R4 `- Resolution:` bullet form — the shape paired with `## Q-NNN — CLOSED <date>` headings; see `.claude/memory/README.md → Closure fields → Body-prose signals`). On a match the helper reads one line from stdin and applies the reply: `y` deletes the block, `n` keeps and does-not-resurface-this-run, `skip` keeps and defers for next-run reconsideration.

You drive this step interactively: ask the user `Close <key> from <file>? (y / n / skip)` for each entry the helper surfaces, then feed the answers to the helper one per line.

### Step 0a-bis — Stamp-closure mode (invoked from /commit, not from /memory-flush)

`sweep.mjs` also exposes a `--mode stamp-closure --backlog-keys <csv>` mode that writes `status: picked-up` + `superseded-at: <today>` to each named `backlog.md` entry. This mode is NOT invoked by `/memory-flush` Step 0; it is invoked by `/commit` Step 6 when `workflow.json → source_backlog_keys` is non-empty. The mode is idempotent (re-running on stamped entries rewrites `superseded-at:` to today; reports them under `already_closed`). The next `/memory-flush` Step 0a auto-close sweep then deletes the stamped entries per the existing `superseded-at:` closure trigger — so `/memory-flush`'s contract is unchanged; it just sees more closures in its `auto-close` step. Report shape: `{"stamped": N, "missing": [keys], "already_closed": [keys]}`.

### Step 0c — Stale sweep

Only run when `memory_session_start.mjs` reported stale > 0 this session, or the user asks. Invoke:

```
node .claude/skills/memory-flush/sweep.mjs --mode stale-sweep --memory-dir .claude/memory
```

The helper re-derives the stale set using the same predicate as the hook (verified-at ≥ 30 commits behind HEAD in git, or last-touched ≥ 30 days in non-git). For each stale entry, prompt the user `Stale: <key> in <file>. re-verify / delete / mark-closed / skip?` and feed the reply. `re-verify` restamps `verified-at:` + `last-touched:` to today; `delete` removes the block; `mark-closed` inserts the register-correct closure field (`resolved-at:` on pending-questions, `superseded-at:` elsewhere) and leaves the block in place so Step 0a auto-closes it next run; `skip` keeps it and resurfaces next session.

### Step 0d — Backlog decay (on demand)

Backlog is stale-exempt under the default decay predicate (intent doesn't verify-against code), but old open entries still accumulate. Run this mode when the user asks or when `backlog.md` has grown noticeably (e.g., > 20 open entries, or > 90 days of accumulated drift). Invoke:

```
node .claude/skills/memory-flush/sweep.mjs --mode backlog-decay --memory-dir .claude/memory --threshold-days 90
```

`--threshold-days` defaults to 90. For each backlog entry whose `raised-on:` (or `last-touched:` fallback) is older than the threshold, the helper reads one reply from stdin and applies it:

- `keep` — refresh `last-touched:` to today; entry stays open.
- `drop` — stamp `status: dropped` + `superseded-at: today`; Step 0a auto-closes it next run.
- `picked-up` — stamp `status: picked-up` + `superseded-at: today`; Step 0a auto-closes it next run.
- `skip` (or empty) — leave the entry untouched and resurface it next time.

You drive this step interactively: prompt the user `Backlog: <key> raised <days> days ago. keep / drop / picked-up / skip?` for each surfaced entry, then feed the replies one per line. Closed entries (those already carrying `superseded-at:`) are skipped — they're handled by Step 0a.

Report shape: `{"surfaced": N, "kept": N, "dropped": N, "picked_up": N, "deferred": N}`.

After Step 0 completes, proceed to Step 1.

## Step 1 — Read everything

Read `_pending.md` in full. Then read the canonical file each candidate targets (don't read all six; read only what's referenced in pending). For each canonical file you'll write to, check the existing entries' stable keys.

## Step 2 — Decide per candidate

**Route suggestion (Tier 3, optional aid).** Before deciding, you MAY run `node -e "import('./.claude/skills/memory-flush/route.mjs').then(m=>console.log(JSON.stringify(m.suggestRoutes(<candidates>))))"` (or import `suggestRoutes` directly) to get a deterministic `{suggested_bucket, weight, evidence}` per candidate. The suggestion is an **accept/override default**, not a decision: you remain final, and promotion to canonical stays human-only (Article IX.3). `route.mjs` is pure — it reads/writes nothing. A richer semantic pass (Sonnet-tier over transcript material) is an optional main-context step here, not part of the pure helper. A candidate's `weight`/`route` fields in `_pending` (when present) are the capture-time hints; the suggestion refines them.

For each `## CANDIDATE:` block, decide one of:

- **Promote.** The candidate is signal. Build the canonical entry shape (see `.claude/memory/README.md`) and append to the right file. If the candidate's stable key already exists in the canonical file → **replace** that entry; do not duplicate.
- **Discard.** The candidate is noise (touched-once file with no clear role; a context7 query that resolved nothing useful; a path under generated/vendored code; an intent line that was a passing chat phrase rather than real future work). No canonical write.
- **Defer.** Useful but you don't have enough context to write a clean entry. Move the candidate verbatim to `pending-questions.md` as a `Q-NNN` entry phrased as "Should X be a landmark?" so the next session can decide. The pending body still gets reset at the end. Allocate the next Q-NNN via `node .claude/skills/memory-flush/next-q-id.mjs` (returns max+1; safe under concurrent writes within the same session).

**Backlog candidates** (`## CANDIDATE: backlog → <slug>-<4hash>`) route to `backlog.md` with the canonical entry shape plus these fields: `status: open` (the initial state; transitions to `picked-up` or `dropped` are later edits), `raised-on: <ISO>`, `raised-in-context: <slug-or-(no active workflow)>`, the verbatim blockquote of the user/assistant intent line. Provenance is `source: user-instruction` for `role: user` candidates or `source: assistant-deferral` for `role: assistant` candidates. The verbatim is REQUIRED for both — `/memory-flush` SHALL reject promotion without it (per `.claude/memory/README.md → Source provenance`).

## Step 3 — Verify before promoting

Per the project memory contract: every entry on the canonical files must have a `verified-at:` field. Verify the candidate's claim before writing:

- **Landmark candidate** → confirm the file exists at the named path (Read tool). If the candidate has no line number, find the relevant symbol and add `:line` to the key. If the file is missing, **discard**.
- **Library candidate** → confirm the version against the project's lockfile (or its stack equivalent). If lockfile absent or version mismatched, mark `verified-at: unverified` and add a caveat instead of a SHA.
- **Decision / landmine / convention candidate** → confirm the cited file/line still exists; if not, surface and discard.

Stamp `verified-at: <short HEAD SHA>` on every promoted entry. If the project isn't a git repo or HEAD isn't reachable, use `verified-at: HEAD` — the staleness predicate then falls back to `last-touched`-days on both git and non-git repos (so a fresh `last-touched: <today>` keeps the entry non-stale, and an old one correctly ages out). The prior "HEAD is permanently fresh on git" semantics was a decay-evasion hatch and was removed.

## Step 4 — Write canonical entries

For each promoted candidate:

1. Read the target canonical file's body.
2. If a stable-key match exists → use Edit to replace that block in place.
3. If no match → use Edit to insert the new entry at the bottom of the body (above any trailing blank lines).
4. After each write, re-read the file and confirm the new/updated entry is present and well-formed.

Apply the canonical entry shape (from `.claude/memory/README.md`):

```markdown
## <stable key>

- <field>: <value>
- ...
- verified-at: <short SHA>
- last-touched: <ISO date YYYY-MM-DD>
- caveat: <optional>
```

## Step 5 — Reset the pending body

After all promotion/discard/defer decisions are written, **rewrite `_pending.md`** to the empty skeleton:

```markdown
---
owners: [memory_stop.mjs writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

Auto-extracted by `memory_stop.mjs` at end of each turn. Run `/memory-flush` to review and commit keepers to the canonical files.

**Content of this file is gitignored.** The file itself (with this header) is committed; everything below the `---` separator below is per-session and not staged.

---
```

Use `Write` to overwrite the file (not `Edit`, since you're truncating).

## Step 6 — Report

Tell the user what happened:

```
memory-flush — <date>

Closed (P):
- <key> → <file> (auto-close | confirmed)
- ...

Stale handled (Q):
- <key> → <file> (re-verified | deleted | marked-closed | skipped)
- ...

Promoted (N):
- <key> → <file> (new | replaced)
- ...

Discarded (M):
- <key> — <reason>
- ...

Deferred (K) → pending-questions.md:
- Q-NNN: <question>
- ...

Pending body reset.
```

# Constraints

- **Never write directly from `_pending.md` to canonical without verification.** The whole point of the curation step is to add the verified-at stamp. Auto-promotion would defeat self-healing.
- **Never duplicate entries.** Stable-key match → replace, don't append a second copy.
- **Never grow a canonical file past its `size-cap`** (default 500 lines). If a write would exceed, prune the oldest unverified entries in the same write — and surface what you pruned in the report.
- **The pending body is gitignored content, but the file itself is committed.** Always reset to the skeleton (don't delete the file).
- **Do not write to `_pending.md` outside this skill.** The hook owns appends; this skill owns clears.
- **Do not write to `.claude/memory/README.md`.** It's documentation, not a memory file.
