# Project memory

Persistent project knowledge that travels with the repo. Loaded into Claude's context at session start (via the `memory_session_start.mjs` hook) and updated as a byproduct of phase skills doing their normal work, plus auto-extracted candidates from the `memory_stop.mjs` hook (curated via `/memory-flush`).

## Files

| File | Owners | Holds |
|---|---|---|
| `landmarks.md` | `scout` | Where things live: `path:line — role` |
| `libraries.md` | `research` | Validated library APIs by `<lib>@<version>` |
| `decisions.md` | `spec`, `rca` | Architectural choices with rationale; rejected approaches |
| `landmines.md` | `security`, `integrate`, `scout` | Gotchas: "do not edit X without also editing Y" |
| `conventions.md` | `scenario`, `implement` | Repo-specific test/code idioms (fixture patterns, naming, layout) |
| `pending-questions.md` | any phase | Open questions the current session couldn't resolve |
| `backlog.md` | `/memory-flush` | Future-work intent captured automatically by `memory_stop.mjs` (intent-line extraction from user prompts and assistant text). Stale-exempt. |
| `constraints.md` | `spec`, `scout` | Facts about the world the project builds around, each with whether it still holds. A flip invalidates every decision resting on it. |
| `_pending.md` | `memory_stop.mjs` (writes), `/memory-flush` (clears) | Auto-extracted candidates awaiting curation. **Content gitignored**; the file structure is committed. |
| `_resume.md` | `memory_pre_compact.mjs` + `memory_stop.mjs` (write), `memory_session_start.mjs` (reads), `harness` (reads) | **Continuity** snapshot — last completed phase, next phase due, in-flight files, recent user prompts. Refreshed every turn-end and again before compaction. Re-injected at every session start (compact / clear / resume / startup). **Gitignored** — pure session state, not project knowledge. |
| `_thread.md` | `shelve_capture.mjs` (appends), `shelve_detect.mjs` (stages candidate via `memory_stop`), `resume_transform.mjs` + `memory_session_start.mjs` (read) | **Durable local thread trail** (CLAUDE.md Art. IX clause 8). One append-only rolling section per shelve: verbatim cues + open questions + in-flight files + next step over the cursor span since the last shelve. Model-internal (Claude Code shelves/resumes; never the human; not a skill/command). **Gitignored content** (pristine structure ships in `src/memory/_thread.template.md`); **excluded from `/memory-flush`'s reset path**, so it survives flushes and `/clear`. Local + durable — neither ephemeral like `_resume.md` nor committed/curated like the canonical seven. |

## Source provenance (mandatory for feedback-derived entries)

Every entry MUST carry a `source:` field declaring how the rule was learned. Allowed values:

| `source:` | Meaning | `verbatim:` requirement |
|---|---|---|
| `user-instruction` | The user stated a rule or directive in conversation | **Required** |
| `user-feedback` | The user corrected behavior or affirmed a non-obvious approach | **Required** |
| `assistant-deferral` | Claude verbalized a deferred follow-up during conversation (captured by `memory_stop.mjs` intent extraction into `backlog.md`) | **Required** (Claude's own sentence as verbatim) |
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

### Which bullets become frontmatter (`LIFTABLE_FIELDS`)

When a flat entry is sharded, exactly seven body bullets move into the fact file's frontmatter. Matching is case-insensitive on the **name**, so `- Verified-at:` and `- verified-at:` both lift.

| Field | Read by | Purpose |
|---|---|---|
| `verified-at` | `memory_session_start.mjs → isStale()`, `sweep.mjs` | Art. IX.5 decay predicate |
| `last-touched` | `memory_session_start.mjs → isStale()`, `sweep.mjs` | decay, non-git fallback |
| `status` | `closure-check.mjs`, `sweep.mjs` | backlog closure state |
| `superseded-at` | `closure-check.mjs`, `sweep.mjs` | closure stamp (six categories) |
| `resolved-at` | `sweep.mjs` | closure stamp (`pending-questions` only) |
| `source` | `/memory-flush` verbatim gate | provenance (Art. IX.6) |
| `raised-on` | `sweep.mjs → modeBacklogDecay` | backlog decay |

`key`, `category`, and `scope` are **structural** — the emitted preamble owns them, so a body bullet of those names is dropped rather than lifted.

Every other `- Name: value` bullet stays in the body verbatim, including names that some entries happen to carry in frontmatter (`caveat` appears in 25 frontmatters and 59 bodies; `why`, `decision`, `convention`, and `reference` are split similarly). That placement is cosmetic — nothing reads those names — so it is left alone.

**Extension rule.** A name is liftable if and only if a named mechanical consumer reads it. Adding one to the list requires naming that consumer in the same commit. `estimated-effort` and `raised-in-context` were proposed and removed under this rule (no mechanical reader anywhere); `links` was removed too (it has a reader in `build-index.mjs`, but zero corpus entries carry it). A field with no reader stays in the body, which is the harmless direction — the allowlist fails safe.

Multiple verbatim blocks are allowed (and encouraged) when the user clarifies or refines an instruction across turns — each new clarification gets its own `> verbatim (user, <ISO date>):` block; older blocks are kept for provenance.

| File | Stable key |
|---|---|
| `landmarks.md` | `path:line` |
| `libraries.md` | `<lib>@<version>` |
| `decisions.md` | short slug (e.g., `auth-jwt-vs-session`) |
| `landmines.md` | `path:line` or short description slug |
| `conventions.md` | short slug |
| `pending-questions.md` | auto-numbered `Q-NNN` |
| `backlog.md` | `<8-word-kebab-slug>-<4-char-sha256>` (derived by `memory_stop.mjs` from the intent verbatim) |

## Constraints (the eighth category)

A constraint records a fact about the world this project has to build around, together with whether that fact still holds. Two live examples: `no-jvm-available`, `zero-runtime-dependencies`.

| Field | Meaning |
|---|---|
| `state:` | Boolean. `true` means the constraint HOLDS. |
| `state_verified_at:` | Short SHA of the last time `state` was actually checked. |
| `governs:` | Path globs the constraint bears on. |

It is a category rather than a field on `decisions` because the two lifecycles differ. A decision is immutable and expires by supersession. A constraint is mutable and re-verifiable: its `state` flips when the world changes. A constraint that five decisions depend on would otherwise be copied into all five, and a flip would have no single place to record it.

When a constraint's `state` flips, every decision naming it in `rests_on:` is surfaced as suspect. That edge is why this is a category and not a field.

Three optional fields on `decisions` entries support it:

| Field | Meaning |
|---|---|
| `governs:` | Path globs. Anchors the decision to the code it governs, so it surfaces when that code is edited rather than only when a spec is written. |
| `rests_on:` | Constraint keys this decision's rationale depends on. |
| `load_bearing:` | Boolean. Absent reads as `false` (incidental), never undefined. |

`scope: any` is a valid scope value. Migrated facts carrying no scope are backfilled to it, so no fact is unreachable.

## Decay

An entry that has gone 30 commits or 30 days without verification is marked stale, and the next phase that touches it re-checks or removes it. Three categories sit outside that rule, for three different reasons.

`decisions` never age out. A decision expires by being superseded, not by elapsed time: an open decision is still in force however old the commit that verified it. Re-verification pressure for decisions comes from the self-healing rule below, not from the decay sweep.

`constraints` do age out, and that is deliberate. `state_verified_at:` records when someone last checked whether the constraint still holds, which is exactly the thing that goes stale.

`backlog` is exempt for its own reason: it holds intent, and intent does not verify against code.

## Self-healing rules

**Memory accelerates triage; it never authorizes a skip.** Every skill that *cites* a memory entry must first re-verify it (file exists, symbol still at named line, library version still pinned). On verification failure, the skill **corrects or deletes the entry in the same run** before proceeding. Drift self-heals because every read is also a check.

## Storage shape (flat vs sharded)

Each canonical category is stored in one of two shapes, detected **presence-based** on disk (the memory hooks and `audit-baseline` adapt automatically — no flag is consulted at read time):

- **Flat** (default; what a fresh install ships): one file `<name>.md` holding many `## <key>` entry blocks, capped by `size-cap:`.
- **Sharded** (activated via `memory.sharded_store` + a migration): a directory `<category>/` of one-fact-per-file entries `<category>/<key>.md`. Each fact file carries frontmatter (`key:` = the original stable key verbatim, `category:`, `scope:`, plus the entry's fields) and the entry body/verbatim. No per-file line cap — growth never forces a destructive prune.

**Scope + decision-point surfacing.** A sharded fact's `scope:` lists the workflow phases at which it should surface as an *active constraint*. `process_lifecycle_guard` (on a Write/Edit to a phase artifact, e.g. `docs/specs/**` → phase `spec`) calls `.claude/hooks/lib/scoped-memory.mjs → surfaceScopedMemory(phase)` and emits the matching facts (verbatim for ≤3, a bounded index otherwise) **before** the write — so a captured lesson (e.g. the outcome-AC landmine) constrains the moment it is relevant rather than sitting in a passive archive.

**Migration is lossless and reversible.** `node .claude/skills/memory-index/migrate.mjs --forward|--reverse --root .claude/memory` explodes the flat files into per-fact dirs (proving file-count == block-count before removing any source) and back. The **filename** is a CWE-22-safe slug of the heading; the **key** is the heading verbatim, so `path:line` / `lib@version` stable keys survive. The session-start index is built from frontmatter only (`.claude/skills/memory-index/build-index.mjs`), keeping the upfront context cheap.

**Repairing a sharded store — `--relift`.** `node .claude/skills/memory-index/migrate.mjs --relift --root .claude/memory` moves any stranded `LIFTABLE_FIELDS` bullet from an entry body into its frontmatter. Idempotent: a second run reports `relifted: 0`. The report is `{scanned, relifted, unchanged, refused, collisions}`, and the exit code is 1 when `refused > 0`.

An entry is **refused** when a body bullet's name is liftable and the frontmatter already carries that key with a *different* value. The entry is left byte-identical and the collision is reported for a human to resolve; equal values dedup silently. This is REJECT-never-normalize — two different meanings sharing one name cannot be told apart mechanically, and guessing would destroy one of them.

**Sweeps are gated on a repaired store.** `sweep.mjs` refuses *every* mode while any allowlisted bullet is still stranded — including `stamp-closure` (fired automatically by `/commit`) and `auto-close` (fired by `/memory-flush`). The remedy is the `--relift` command above, and the error names it. The guard exists because an unrepaired store makes its two readers disagree: the session-start index reads frontmatter only, while `sweep.mjs` reads frontmatter *and* body, so they report different stale counts. Curating against the larger set while every other surface believes the smaller one churns entries without fixing the invisibility.

## Bounding rules

- In the **flat** shape, each canonical file has `size-cap: <N>` in frontmatter (default 500 lines). When a skill writes and exceeds, it must prune the oldest unverified entries in the same write. Working-set discipline. The **sharded** shape has no per-file cap (one fact per file).
- Decay: entries unverified for ≥30 commits (git) OR ≥30 days since `last-touched:` (non-git fallback) are marked `stale`. The next phase that touches them either re-verifies or deletes.

## Closure fields

Two equivalent closure forms cause `/memory-flush` Step 0a to delete the entry block on its next run. **Both are first-class** — `/memory-flush sweep --mode auto-close` accepts either.

### Form A — structured field (machine-friendly, programmatically writable)

| File | Field | Semantics |
|---|---|---|
| `pending-questions.md` | `resolved-at: <ISO date>` | The question has been answered; entry is closed. |
| `landmarks.md`, `libraries.md`, `decisions.md`, `landmines.md`, `conventions.md`, `backlog.md` | `superseded-at: <ISO date>` | The fact (or, for `backlog.md`, the open intent) is no longer current; entry is closed. On the `backlog` category the `status:` field (`picked-up` / `dropped`) disambiguates which transition triggered the close — in frontmatter on a sharded store, as a body bullet on a flat one. |

### Form B — heading suffix (human-friendly, scannable on render)

Append `— CLOSED <ISO date>` to the entry's `##` heading. The em-dash `—` (U+2014) is canonical; ASCII `--` is also accepted. Example:

```
## Q-005 — CLOSED 2026-05-16

- Resolution: decided in spec; kept for historical reference
```

Form B is preferred for `pending-questions.md` — the close status is visible at-a-glance when reading the rendered file. Form A is preferred for automated writes (e.g., `/commit`'s `stamp-closure` mode on backlog entries). Both close the entry equivalently.

**Per-file invariant**: on `pending-questions.md`, `superseded-at:` MUST NOT appear; on the other five canonical files, `resolved-at:` MUST NOT appear. Mutually exclusive at the file level. Not enforced by audit — documented invariant only. The `/memory-flush` Step 0a sweep flags violations in its report rather than deleting.

**Body-prose signals.** Four regexes, case-insensitive, line-anchored:

- R1: `^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b`
- R2: `^Superseded\s+(by|at|on)\b`
- R3: `^Resolved\s+(by|on|at)\b`
- R4: `^(\s*-\s*)?\*{0,2}Resolution\s*:` — bullet-list `- Resolution:` form commonly paired with Form B headings.

A match without a corresponding structured closure field or heading suffix causes `/memory-flush` Step 0b to surface a once-per-entry `Close <key> from <file>? (y / n / skip)` prompt.

**Closure short-circuits decay (AC-005).** `memory_session_start.mjs` excludes any entry carrying a closure field from the stale count. `stale` ≠ `closed`: a stale entry is *unverified*; closure is a separate, deliberate signal that the entry is no longer load-bearing.

**Automated closure-stamp on backlog pickup.** When `/triage` records a workflow that picks up a backlog entry (the `workflow.json → source_backlog_keys` array carries the entry's stable key), `/commit` Step 6 invokes `node .claude/skills/memory-flush/sweep.mjs --mode stamp-closure --memory-dir .claude/memory --backlog-keys <csv>` after `git commit` succeeds. The mode writes `status: picked-up` + `superseded-at: <today>` to each named entry; the next `/memory-flush` Step 0a auto-deletes them. `/commit` is the only caller of this mode; `sweep.mjs` is the only writer to `backlog.md` during closure-stamping — the curator-not-writer pattern is preserved through the actuator boundary.

## How memory gets updated

Two paths:

1. **Phase skills, as a byproduct.** Each skill that produces a workflow artifact also writes any new entries for its owned file. No separate "update memory" task — the same tool call as the artifact write.
2. **Stop hook auto-extraction.** `memory_stop.mjs` reads the just-completed turn's transcript, extracts touched paths / cited library APIs / verbalized decisions, and appends candidates to `_pending.md`. Claude reviews via `/memory-flush` and commits keepers to canonical files.

## Read order on session start

`memory_session_start.mjs` hook prints a compact index (number of entries per file, count of stale entries, count of pending candidates), then appends the body of `_resume.md` if a recent snapshot exists, with a framing line that depends on the session source (`compact` / `clear` / `resume` / `startup`). Canonical files load on first relevant skill invocation.

## Continuity vs knowledge

Seven canonical files plus `_pending.md` hold **project knowledge** — facts about the codebase that survive multiple sessions and get re-verified on every cite. `_resume.md` is different: it's a **continuity snapshot** describing the *current session* — what we just touched, what the user just asked, what phase we're on. It's overwritten each turn and gitignored. The split keeps long-term knowledge clean of session-state noise.

`_thread.md` is a **third class — local + durable**. Unlike the canonical seven it is gitignored and never committed (continuity is per-developer noise across a team); unlike `_resume.md` it is append-only and durable rather than overwritten each turn, and it is explicitly excluded from `/memory-flush`'s reset so a shelved thread survives a flush or `/clear`. It is the durable home for the "what we were working on, and why" narrative that `_resume.md` only ever holds for the latest turn.

## Capture/route fields (Tier 2/3 — additive, backward-compatible)

Auto-extracted `_pending.md` intent candidates MAY carry two optional lines, written by `memory_stop.mjs`:

- `- route: unassigned` — the routing bucket. `unassigned` at capture; a human (with an optional model suggestion from `.claude/skills/memory-flush/route.mjs`) assigns the final bucket at `/memory-flush`. Promotion to canonical stays human-only (Article IX.3); the route is only ever a suggestion.
- `- weight: <0..1>` — a deterministic salience score (higher = more likely worth keeping). Advisory; the human curates.

Blocks without these lines parse exactly as before — the fields are additive.

`_thread.md` entries MAY carry `working_thread: true` (inside the base64 entry JSON). Such an entry is the **durable working thread** — the "what/why" distilled by `resume_writer.mjs` at stop/pre-compact. `thread_store.pruneTrail` pins the most-recent working-thread entry (exempt from the 20-section cap) so it survives `/clear`; `readWorkingThread()` reads it and `memory_session_start` surfaces it on resume. This is a flag on the existing entry shape, not a new entry schema.
