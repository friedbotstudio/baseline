---
name: memory-flush
owner: baseline
description: Review the auto-extracted candidates in `.claude/memory/_pending.md` and commit keepers to the canonical memory files (`landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `pending-questions.md`). Invoke at session start when the SessionStart hook reports pending candidates, or any time `_pending.md` has accumulated entries you want to curate. Reset the pending body after flushing.
---

# memory-flush — curate auto-extracted memory candidates

The `memory_stop.sh` hook appends candidates to `.claude/memory/_pending.md` after every turn. This skill reviews them in main context (where conversation richness is preserved), commits the keepers to the right canonical file with proper metadata, and resets the pending body.

The hook is a passive collector. **You are the curator.** Discard noise, promote signal, deduplicate against existing canonical entries.

# Inputs

- `.claude/memory/_pending.md` — the pending body. Each block looks like:
  ```
  ## CANDIDATE: <key> → <target-file>.md
  - field: value
  - field: value
  ```
- The six canonical files at `.claude/memory/<name>.md`. Read each before deciding where a candidate lands and whether it duplicates existing content.

# Method

## Step 0 — Canonical sweep (closure semantics)

Before reviewing `_pending.md`, sweep the six canonical files for closed entries and stale entries. The `sweep.py` helper at `.claude/skills/memory-flush/sweep.py` is the deterministic actuator; this SOP composes the three modes.

### Step 0a — Auto-close structured closure fields

Invoke:

```
python3 .claude/skills/memory-flush/sweep.py --mode auto-close --memory-dir .claude/memory
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
python3 .claude/skills/memory-flush/sweep.py --mode prose-scan --memory-dir .claude/memory
```

For each entry without a structured closure field, the helper scans the body against three anchored, case-insensitive regexes (R1 `Resolution path taken|by|date`, R2 `Superseded by|at|on`, R3 `Resolved by|on|at`). On a match the helper reads one line from stdin and applies the reply: `y` deletes the block, `n` keeps and does-not-resurface-this-run, `skip` keeps and defers for next-run reconsideration.

You drive this step interactively: ask the user `Close <key> from <file>? (y / n / skip)` for each entry the helper surfaces, then feed the answers to the helper one per line.

### Step 0c — Stale sweep

Only run when `memory_session_start.sh` reported stale > 0 this session, or the user asks. Invoke:

```
python3 .claude/skills/memory-flush/sweep.py --mode stale-sweep --memory-dir .claude/memory
```

The helper re-derives the stale set using the same predicate as the hook (verified-at ≥ 30 commits behind HEAD in git, or last-touched ≥ 30 days in non-git). For each stale entry, prompt the user `Stale: <key> in <file>. re-verify / delete / mark-closed / skip?` and feed the reply. `re-verify` restamps `verified-at:` + `last-touched:` to today; `delete` removes the block; `mark-closed` inserts the register-correct closure field (`resolved-at:` on pending-questions, `superseded-at:` elsewhere) and leaves the block in place so Step 0a auto-closes it next run; `skip` keeps it and resurfaces next session.

After Step 0 completes, proceed to Step 1.

## Step 1 — Read everything

Read `_pending.md` in full. Then read the canonical file each candidate targets (don't read all six; read only what's referenced in pending). For each canonical file you'll write to, check the existing entries' stable keys.

## Step 2 — Decide per candidate

For each `## CANDIDATE:` block, decide one of:

- **Promote.** The candidate is signal. Build the canonical entry shape (see `.claude/memory/README.md`) and append to the right file. If the candidate's stable key already exists in the canonical file → **replace** that entry; do not duplicate.
- **Discard.** The candidate is noise (touched-once file with no clear role; a context7 query that resolved nothing useful; a path under generated/vendored code). No canonical write.
- **Defer.** Useful but you don't have enough context to write a clean entry. Move the candidate verbatim to `pending-questions.md` as a `Q-NNN` entry phrased as "Should X be a landmark?" so the next session can decide. The pending body still gets reset at the end.

## Step 3 — Verify before promoting

Per the project memory contract: every entry on the canonical files must have a `verified-at:` field. Verify the candidate's claim before writing:

- **Landmark candidate** → confirm the file exists at the named path (Read tool). If the candidate has no line number, find the relevant symbol and add `:line` to the key. If the file is missing, **discard**.
- **Library candidate** → confirm the version against the project's lockfile (or its stack equivalent). If lockfile absent or version mismatched, mark `verified-at: unverified` and add a caveat instead of a SHA.
- **Decision / landmine / convention candidate** → confirm the cited file/line still exists; if not, surface and discard.

Stamp `verified-at: <short HEAD SHA>` on every promoted entry. If the project isn't a git repo or HEAD isn't reachable, use `verified-at: HEAD` (the SessionStart hook treats `HEAD` as fresh).

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
owners: [memory_stop.sh writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

Auto-extracted by `memory_stop.sh` at end of each turn. Run `/memory-flush` to review and commit keepers to the canonical files.

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
