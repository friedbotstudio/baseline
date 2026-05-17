# Project memory

Persistent project knowledge that travels with the repo. Loaded into Claude's context at session start (via the `memory_session_start.sh` hook) and updated as a byproduct of phase skills doing their normal work, plus auto-extracted candidates from the `memory_stop.sh` hook (curated via `/memory-flush`).

## Files

| File | Owners | Holds |
|---|---|---|
| `landmarks.md` | `scout` | Where things live: `path:line — role` |
| `libraries.md` | `research` | Validated library APIs by `<lib>@<version>` |
| `decisions.md` | `spec`, `rca` | Architectural choices with rationale; rejected approaches |
| `landmines.md` | `security`, `integrate`, `scout` | Gotchas: "do not edit X without also editing Y" |
| `conventions.md` | `scenario`, `implement` | Repo-specific test/code idioms (fixture patterns, naming, layout) |
| `pending-questions.md` | any phase | Open questions the current session couldn't resolve |
| `backlog.md` | `/memory-flush` | Future-work intent captured automatically by `memory_stop.sh` (intent-line extraction from user prompts and assistant text). Stale-exempt. |
| `_pending.md` | `memory_stop.sh` (writes), `/memory-flush` (clears) | Auto-extracted candidates awaiting curation. **Content gitignored**; the file structure is committed. |
| `_resume.md` | `memory_pre_compact.sh` + `memory_stop.sh` (write), `memory_session_start.sh` (reads), `harness` (reads) | **Continuity** snapshot — last completed phase, next phase due, in-flight files, recent user prompts. Refreshed every turn-end and again before compaction. Re-injected at every session start (compact / clear / resume / startup). **Gitignored** — pure session state, not project knowledge. |

## Source provenance (mandatory for feedback-derived entries)

Every entry MUST carry a `source:` field declaring how the rule was learned. Allowed values:

| `source:` | Meaning | `verbatim:` requirement |
|---|---|---|
| `user-instruction` | The user stated a rule or directive in conversation | **Required** |
| `user-feedback` | The user corrected behavior or affirmed a non-obvious approach | **Required** |
| `assistant-deferral` | Claude verbalized a deferred follow-up during conversation (captured by `memory_stop.sh` intent extraction into `backlog.md`) | **Required** (Claude's own sentence as verbatim) |
| `incident` | Recovered from an actual failure or near-miss in this session | Recommended (incident-report quote) |
| `inferred-from-code` | Derived by reading the codebase | Not applicable |
| `library-pinned` | Came from a `context7` lookup | Not applicable (cited URL/version is the source) |
| `unrecorded` | Pre-schema-bump entry whose source was lost | Quality flag — curator must clear at next touch |

For `source: user-instruction` and `source: user-feedback`, the entry MUST include a `verbatim:` blockquote of the user's actual words. The verbatim is the canonical truth; the body of the entry is Claude's interpretation. **When verbatim and interpretation conflict, verbatim wins** — `CLAUDE.md` Article IX clause 6.

The verbatim is not a summary, not a paraphrase, and not in Claude's voice. It is the user's words. If the original turn is no longer available, the entry's source is `unrecorded` and the curator MUST flag it for the user to confirm or restate at the next opportunity.

`/memory-flush` SHALL reject any candidate promotion to a canonical file when `source` is `user-instruction`, `user-feedback`, or `assistant-deferral` and `verbatim:` is missing or empty.

## Per-entry shape (canonical files)

```markdown
## <stable key>

> verbatim (user, <ISO date>):
> <user's exact words, attributed — required when source ∈ {user-instruction, user-feedback}>

- source: <user-instruction|user-feedback|incident|inferred-from-code|library-pinned|unrecorded>
- <field>: <value>
- verified-at: <commit SHA short>
- last-touched: <ISO date>
- caveat: <optional>
```

The **stable key** is the entry's primary key for deduplication. New entries with the same key replace; different keys append. The verbatim block is intentionally a markdown blockquote (`> ...`) so it survives plain-text grep and renders distinctly when the file is read.

Multiple verbatim blocks are allowed (and encouraged) when the user clarifies or refines an instruction across turns — each new clarification gets its own `> verbatim (user, <ISO date>):` block; older blocks are kept for provenance.

| File | Stable key |
|---|---|
| `landmarks.md` | `path:line` |
| `libraries.md` | `<lib>@<version>` |
| `decisions.md` | short slug (e.g., `auth-jwt-vs-session`) |
| `landmines.md` | `path:line` or short description slug |
| `conventions.md` | short slug |
| `pending-questions.md` | auto-numbered `Q-NNN` |
| `backlog.md` | `<8-word-kebab-slug>-<4-char-sha256>` (derived by `memory_stop.sh` from the intent verbatim) |

## Self-healing rules

**Memory accelerates triage; it never authorizes a skip.** Every skill that *cites* a memory entry must first re-verify it (file exists, symbol still at named line, library version still pinned). On verification failure, the skill **corrects or deletes the entry in the same run** before proceeding. Drift self-heals because every read is also a check.

## Bounding rules

- Each canonical file has `size-cap: <N>` in frontmatter (default 500 lines). When a skill writes and exceeds, it must prune the oldest unverified entries in the same write. Working-set discipline.
- Decay: entries unverified for ≥30 commits (git) OR ≥30 days since `last-touched:` (non-git fallback) are marked `stale`. The next phase that touches them either re-verifies or deletes.

## Closure fields

Two optional, register-specific closure fields cause `/memory-flush` Step 0 to delete the entry block on its next run:

| File | Field | Semantics |
|---|---|---|
| `pending-questions.md` | `resolved-at: <ISO date>` | The question has been answered; entry is closed. |
| `landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `backlog.md` | `superseded-at: <ISO date>` | The fact (or, for `backlog.md`, the open intent) is no longer current; entry is closed. On `backlog.md` the body `status:` field (`picked-up` / `dropped`) disambiguates which transition triggered the close. |

**Per-file invariant**: on `pending-questions.md`, `superseded-at:` MUST NOT appear; on the other five canonical files, `resolved-at:` MUST NOT appear. Mutually exclusive at the file level. Not enforced by audit — documented invariant only. The `/memory-flush` Step 0a sweep flags violations in its report rather than deleting.

**Body-prose signals.** Three regexes, case-insensitive, line-anchored:

- R1: `^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b`
- R2: `^Superseded\s+(by|at|on)\b`
- R3: `^Resolved\s+(by|on|at)\b`

A match without a corresponding structured closure field causes `/memory-flush` Step 0b to surface a once-per-entry `Close <key> from <file>? (y / n / skip)` prompt.

**Closure short-circuits decay (AC-005).** `memory_session_start.sh` excludes any entry carrying a closure field from the stale count. `stale` ≠ `closed`: a stale entry is *unverified*; closure is a separate, deliberate signal that the entry is no longer load-bearing.

**Automated closure-stamp on backlog pickup.** When `/triage` records a workflow that picks up a backlog entry (the `workflow.json → source_backlog_keys` array carries the entry's stable key), `/commit` Step 6 invokes `python3 .claude/skills/memory-flush/sweep.py --mode stamp-closure --memory-dir .claude/memory --backlog-keys <csv>` after `git commit` succeeds. The mode writes `status: picked-up` + `superseded-at: <today>` to each named entry; the next `/memory-flush` Step 0a auto-deletes them. `/commit` is the only caller of this mode; `sweep.py` is the only writer to `backlog.md` during closure-stamping — the curator-not-writer pattern is preserved through the actuator boundary.

## How memory gets updated

Two paths:

1. **Phase skills, as a byproduct.** Each skill that produces a workflow artifact also writes any new entries for its owned file. No separate "update memory" task — the same tool call as the artifact write.
2. **Stop hook auto-extraction.** `memory_stop.sh` reads the just-completed turn's transcript, extracts touched paths / cited library APIs / verbalized decisions, and appends candidates to `_pending.md`. Claude reviews via `/memory-flush` and commits keepers to canonical files.

## Read order on session start

`memory_session_start.sh` hook prints a compact index (number of entries per file, count of stale entries, count of pending candidates), then appends the body of `_resume.md` if a recent snapshot exists, with a framing line that depends on the session source (`compact` / `clear` / `resume` / `startup`). Canonical files load on first relevant skill invocation.

## Continuity vs knowledge

Seven canonical files plus `_pending.md` hold **project knowledge** — facts about the codebase that survive multiple sessions and get re-verified on every cite. `_resume.md` is different: it's a **continuity snapshot** describing the *current session* — what we just touched, what the user just asked, what phase we're on. It's overwritten each turn and gitignored. The split keeps long-term knowledge clean of session-state noise.
