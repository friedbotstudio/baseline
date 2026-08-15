# Security reports — epic-roadmap-and-backlog-retriage

## epic-roadmap-and-backlog-retriage-2026-08-15.md

# Security Review — epic-roadmap-and-backlog-retriage — 2026-08-15

## Summary

Overall risk at review time: **MEDIUM**. No Critical or High findings. Two Medium findings, both reproduced against the live modules: an unvalidated epic/slice title forges roadmap heading status and whole headings (CWE-74), and `backfillEpics` throws after a successful roadmap write when the epic-state stamp fails, breaking the fail-open invariant the design rests on and leaving the roadmap and the epic state inconsistent. Two Low findings (quadratic regex on a pathological line; `__proto__` carried as an own property). No new dependencies, no secrets, no network or shell surface introduced.

**Post-review status: both Medium findings are FIXED in this same workflow**, each with a failing test written first (`tests/epic-roadmap-append.test.mjs`). The fail-open finding was an AC-009 violation — the approved spec already promised "never throws" — so closing it delivered the spec rather than widening it. The two Lows are accepted as recorded; neither is reachable from an untrusted input and each names its remedy if that changes. **Residual risk: LOW.**

## Findings

### [MEDIUM] Epic and slice titles are interpolated into the roadmap grammar unvalidated

- **OWASP**: A03 — Injection | **CWE**: CWE-74 (format/structure injection)
- **File**: `.claude/skills/roadmap-sync/append.mjs:52-58` (`renderEpicSection`)
- **Evidence**:
  ```js
  const lines = [`## Epic ${num} — ${title}  ${impliedHeadingStatus(slices)}  (${tag})`, ''];
  if (summary) lines.push(summary, '');
  for (const slice of slices) lines.push(`- ${slice.status ?? PLANNED} ${slice.id}. ${slice.title}`);
  ```
  `title` comes from `.claude/state/epic/<slug>.json → title` via `backfill.titleFor`; `slice.title` from that file's `slices[]`. Neither is checked for a status emoji or a newline. `slice.id` **is** validated (`SLICE_ID`); the titles are not.

  Reproduced against the live modules and the real `parseRoadmap`:

  ```
  title = "Ship ✅ now"      -> epic 2 parses status=done   (every slice row is ⬜)
  title = "X\n\n## Epic 99 — Injected  ✅  (pwned)\n"
                             -> epic 99 appears; the real epic 2 degrades to
                                status=unknown, tag=null
  ```
- **Impact**: A planned epic reports as shipped. `statusFromHeadingEmoji` takes the *earliest* emoji on the heading, so an emoji in the title wins over the real status marker. `standup` reads that tally to answer "what shipped?", and this repo's release model gates a cut on completeness — a forged ✅ is a wrong answer to the question the recap exists to answer. The newline variant forges an arbitrary heading and mangles the adjacent real one. Reachability is bounded: `.claude/state/` is gitignored, so the input is local state written by `/triage`, `retriage.mjs`, or a hand edit — not a remote or cross-repo attacker.
- **Recommendation**: Reject, do not sanitize — the same call this repo already made at `.claude/skills/workspace/render.mjs:40` and `shards.mjs:64` (both MEDIUM, 2026-08-05). Have `renderEpicSection` throw a named error when `title`, `tag`, or any `slice.title` contains a newline or one of `⬜🟡✅`, alongside the existing `SLICE_ID` check. Rejecting keeps the grammar's one-emoji-per-heading contract enforceable at the only site that creates headings.
- **FIXED**: `append.mjs → assertInert` rejects both classes on `title`, `tag`, and every `slice.title`, at the only site that creates a heading. `backfillEpics` catches the throw per-epic, so a forged state file is reported in `skipped[]` and the roadmap is left byte-identical rather than the run dying. Covered by `test_when_title_or_slice_title_forges_the_grammar_then_render_throws` (all four forgeries above) and `test_when_a_forged_title_reaches_backfill_then_that_epic_is_skipped_and_nothing_is_written`.

### [MEDIUM] `backfillEpics` throws after a partial write, breaking its fail-open contract

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-460 (improper cleanup on throw)
- **File**: `.claude/skills/roadmap-sync/backfill.mjs:80-86`
- **Evidence**:
  ```js
  try {
    writeFileSync(roadmapPath, text, 'utf8');
  } catch {
    return noop('roadmap-unwritable', skipped);
  }
  for (const stamp of stamps) stampEpicNumber(stamp.path, stamp.state, stamp.num);
  ```
  The roadmap write is guarded; the stamp loop is not. Reproduced with a read-only epic-state file:

  ```
  THREW: EACCES
  roadmap already written? true
  state stamped?          NO
  ```
- **Impact**: Two consequences. First, the stated invariant — "every failure path returns `{noop:true, reason}` and never throws", the property that lets this run inside a commit path — is false, so an unwritable state file propagates an exception into Phase 10.6 and can block a commit the roadmap was never allowed to block. Second, the surviving state is inconsistent in a way that is silent: the roadmap gains `## Epic N` but the epic state never gains `roadmap_epic`, so every `epic-child` of that epic seeds an empty `roadmap_tasks[]` and its row can never turn green. AC-009 promises the no-throw behaviour; the scenario suite exercises an unwritable *roadmap* but not an unwritable *state file*, which is how this got through.
- **Recommendation**: Wrap the stamp loop and degrade rather than throw — report the un-stamped slugs in `skipped[]` with a named reason so the operator can see which epics need a re-run. Add the scenario the suite is missing: state file unwritable, roadmap already written.
- **FIXED**: the stamp loop is now per-epic `try`/`catch`; a failed stamp pushes `appended, but the roadmap_epic stamp failed: <reason>` into `skipped[]` and the run still returns. Covered by `test_when_epic_state_unwritable_then_stamp_degrades_and_backfill_does_not_throw`, which is the scenario the original suite lacked.

### [LOW] `TAG` matching is quadratic on a pathological heading line

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-1333 (inefficient regex)
- **File**: `.claude/skills/roadmap-sync/append.mjs:11-12`
- **Evidence**:
  ```js
  const TAG = /\(([^)]*)\)\s*$/;
  ```
  Measured against a single line of `n` unclosed `(` followed by `n` spaces: 2 000 → 13 ms, 8 000 → 198 ms, 20 000 → 1 264 ms. Growth is quadratic, not exponential — there is no nested quantifier, so this is slow, not catastrophic.
- **Impact**: A crafted roadmap line can waste CPU in a local, non-blocking phase. No remote input reaches it; the roadmap is repository-controlled. Speculative as an attack, real as a robustness edge.
- **Recommendation**: Bound the scanned line length before matching, or anchor the tag scan to the heading suffix already isolated by `EPIC_HEADING`. This repo bounds the analogous case in `hooks/lib/glob-match` (star-run refusal) rather than accepting unbounded input.

### [LOW] `__proto__` survives the epic-state round-trip as an own property

- **OWASP**: A08 — Software & Data Integrity Failures | **CWE**: CWE-1321 (prototype pollution, not exploitable here)
- **File**: `.claude/skills/roadmap-sync/epic-store.mjs:41-44` (`stampEpicNumber`)
- **Evidence**:
  ```js
  const next = { ...state, roadmap_epic: num, updated_at: ... };
  ```
  Verified: object spread uses `CreateDataProperty`, not `Set`, so a `__proto__` key from `JSON.parse` does **not** pollute `Object.prototype` (`({}).polluted === false`). It is carried into `next` as an own property and re-serialised.
- **Impact**: None today — the value round-trips as inert JSON. Recorded because a future consumer reading the state with `Object.assign` into a live object, or dereferencing `state.__proto__`, would inherit the hazard from a file this module rewrites.
- **Recommendation**: No change required. If a future reader needs hardening, drop `__proto__` at the parse boundary in `readEpicStates` rather than at each writer.

## What was checked and found clean

- **Path traversal on the operator-supplied slug (CWE-22)** — `materializeRetriagedEpic` calls `assertSafeSlug` **before** either path is constructed; verified by `test_when_retriage_slug_escapes_then_throws_before_path_construction` across `../escape`, `/abs/path`, `Has Spaces`, and `''`, with no state file or workflow created. REJECT, never normalize — `canonicalSlug` is not used as a validator anywhere in the diff.
- **Path construction from directory entries** — `readEpicStates` builds every path by `join(dir, name)` where `name` comes from `readdirSync` of that same directory, so no entry can escape it. Slugs derived from filenames are used for reporting and set membership only; the write path is the one `readdir` returned.
- **Command injection via `source_backlog_keys`** — the keys `retriage.mjs` writes reach `sweep.mjs --backlog-keys <csv>` at `/commit` Step 2.7. `sweep.mjs` parses that with `node:util` `parseArgs` (`.claude/skills/memory-sync/sweep.mjs:545`), and the value is never re-entered into a shell. No injection path.
- **Overwrite of a live workflow** — `materializeRetriagedEpic` refuses when `.claude/state/workflow.json` exists, checked before any write; verified by test.
- **Backlog frontmatter into JSON sinks** — values from `backlog-shard.mjs` reach `workflow.json` and the epic state only through `JSON.stringify`, which escapes them. No format injection on that path. (The roadmap path is the unescaped one — finding 1.)
- **Regexes other than `TAG`** — `EPIC_HEADING`, `SLICE_ID`, and `FRONTMATTER` are linear or lazily anchored; no nested quantifiers.
- **Secrets** — no tokens, keys, or credentials in the diff.
- **Consent and guard surfaces** — the diff writes no consent token, adds no hook, and changes no guard. `.claude/workflows.jsonl` gains one node and still validates against I1–I11.

## Dependencies

No new packages. Every import in the diff is a Node builtin (`node:fs`, `node:path`, `node:util`) or an existing in-repo module (`./sync.mjs`, `./append.mjs`, `../lib/argv.mjs`, `../../hooks/lib/slug.mjs`). The zero-runtime-dependency posture is unchanged; no CVE surface added.

## Out of scope / Noted

- The epic-heading grammar now has three independent declarations (`roadmap/parse.mjs`, `roadmap-sync/sync.mjs`, `roadmap-sync/append.mjs`). Not a vulnerability, but finding 1's fix belongs at whichever site becomes canonical — hoisting it is already flagged for a follow-up spec by `/simplify`.
- `retriage.mjs` does not validate slice `id` at materialization; a malformed id surfaces later as a skipped epic when `renderEpicSection` rejects it. Fail-safe but late — validating at the retriage boundary would report it to the operator at the point of decision.

