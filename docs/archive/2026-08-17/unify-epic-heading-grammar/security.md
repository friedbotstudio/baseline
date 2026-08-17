# Security reports — unify-epic-heading-grammar

## unify-epic-heading-grammar-2026-08-17.md

# Security Review — main (unify-epic-heading-grammar) — 2026-08-17

## Summary

Overall risk: **LOW**. The diff hoists the roadmap epic-heading grammar into `.claude/skills/lib/epic-heading.mjs` and relocates the CWE-74 `assertInert` guard to that canonical site. The four risks named at intake were each tested rather than reasoned about: ReDoS is measured absent, the D6 regex-state trap is measured closed, and the D7 status-vocabulary rename reaches no downstream string comparison. One **MEDIUM** finding was raised and is now **FIXED in this cycle** at the user's direction: `renderEpicSection`'s `summary` parameter reached the plan with no guard. It is closed by `assertSummaryInert`, pinned by AC-014.

## Findings

### [MEDIUM — FIXED] `summary` is an unguarded grammar-injection sink on a public API

- **OWASP**: A03 - Injection | **CWE**: CWE-74
- **File**: `.claude/skills/roadmap-sync/append.mjs:59`
- **Evidence**:
  ```js
  export function renderEpicSection({ num, title, tag, summary, slices = [] }) {
    assertInert(title, 'epic title');
    assertInert(tag, 'epic tag');
    for (const slice of slices) {
      if (!SLICE_ID.test(String(slice.id ?? ''))) { /* throws */ }
      assertInert(slice.title, `slice ${slice.id} title`);
    }

    const lines = [`## Epic ${num} — ${title}  ${impliedHeadingStatus(slices)}  (${tag})`, ''];
    if (summary) lines.push(summary, '');   // <-- no assertInert
  ```
- **Impact**: A `summary` carrying a newline forges arbitrary plan structure. Two concrete payloads, both reaching a real reader:
  - `"x\n\n## Epic 99 — Injected  ✅  (pwned)\n"` — `auditRoadmap` (`sync.mjs:143`) and `epicHeadings` (`append.mjs:19`) both call `matchEpicHeadingLine` per line, so the forged line becomes a genuine epic to every consumer, and `nextEpicNumber` jumps to 100.
  - `"x\n- ✅ T1. Done\n"` — `epicBodyTally` (`sync.mjs:120`) counts every status emoji in the body, including prose. `impliedStatus` then reports the epic done and `promoteEpicHeading` **writes ✅ back into the real heading**. Note `parse.mjs`'s tally is row-derived and immune; `sync.mjs`'s is not, so the two readers disagree.
- **Reachability**: latent, not currently exploitable. The only production caller is `backfill.mjs:54 → epicSpecFor`, which builds `{slug, title, slices}` and never sets `summary`. The gap predates this diff — the guard covered exactly `title` / `tag` / `slice.title` at its former home (`append.mjs:21`, calls at `:59/:60/:65`) too. It is reported here because this diff relocates the guard and rewrites the file header to read "this is the only writer that creates rows, so it is the site that guard protects", which is now a stronger claim than the code makes. The natural next caller — an `/epic` discovery summary — is model-generated text.
- **Recommendation**: add `assertInert(summary, 'epic summary')` beside the existing two calls at `append.mjs:49-50`. One line, no behaviour change for any current caller. Note `assertInert` rejects newlines outright, so a genuinely multi-line summary would need a per-line guard instead; if multi-line summaries are wanted, guard each line for the heading and row grammars rather than for `\n`.
- **Resolution (this cycle)**: `assertSummaryInert` at `append.mjs:55-61`, called from `renderEpicSection` beside the `title` and `tag` guards. `assertInert` alone is **insufficient** for this field and the fix reflects that: `title` and `tag` are interpolated mid-line, but `summary` is pushed as a line of its own (`lines.push(summary, '')`), so a newline-free, emoji-free `## Epic 99 — Injected (pwned)` passes `assertInert` and still forges a heading. The guard is therefore two-part — `assertInert` for the newline and status-emoji classes, plus a `matchEpicHeadingLine` rejection for the residual heading. Row grammars all require a status emoji, so `assertInert` already covers those. Pinned by **AC-014** in `tests/epic-heading-grammar.test.mjs`; `tests/epic-roadmap-append.test.mjs` (which passes both a prose `summary` and `summary: ''`) passes unmodified.

### [LOW] `promoteEpicHeading` can double a heading's status emoji

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20
- **File**: `.claude/skills/roadmap-sync/sync.mjs:90-93`
- **Evidence**:
  ```js
  if (heading.includes(wanted) && (heading.match(statusEmojiScanner()) || []).length === 1) {
    return { text, changed: false, status };
  }
  lines[headingIdx] = heading.replace(statusEmojiScanner(), wanted);
  ```
- **Impact**: the early return requires **exactly one** emoji, so a heading already carrying two falls through to a **global** `.replace()` that rewrites both — yielding `## Epic 5 — Title  ✅  ✅  (tag)`. Self-healing rather than destructive: `auditRoadmap`'s `ADJACENT_EMOJI` check reports the result as malformed. Pre-existing; the former local regex also carried `g`.
- **Recommendation**: none required this cycle. If tightened later, replace only the first match and let `auditRoadmap` keep reporting the rest.

### [LOW] D7 changes the `roadmap` CLI's displayed and accepted status vocabulary

- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-1188
- **File**: `.claude/skills/roadmap/cli.mjs:38-41,47,67`
- **Impact**: `Status.IN_PROGRESS` moved from `in_progress` to `in-progress`, so `[${epic.status}]` and `[${task.status}]` now render `[in-progress]`, and `--status in_progress` is no longer accepted. **The failure is loud, not silent**: `parseStatusFilter` validates against `STATUS_VALUES` derived from the enum and rejects the old spelling with `--status must be one of done | in-progress | planned; got "in_progress"`. No silent zero-result path exists. The adjacent literal `in_progress:${inProgress}` on line 67 is a hardcoded label over the camelCase tally count and is unaffected.
- **Recommendation**: none. A named usage error is the correct behaviour for a retired enum value on a repo-local CLI with no external consumers.

## Verified clean (what was checked, and how)

| Risk | Method | Result |
|---|---|---|
| CWE-1333 ReDoS, `LINE_RE` / `TEXT_RE` | timed 60k-char pathological inputs: trailing-space-run failure, all-space body, unterminated digit run | 0.10–0.38 ms; both anchored `^…$`, and the only overlapping pair (`\s+` before `(.+)`) is polynomial, not exponential |
| CWE-1333 ReDoS, interpolated patterns | timed `TASK_ROW_RE`, `TASK_LINE`, `ADJACENT_EMOJI`, `HEADING_EMOJI_TAIL` at 60k chars | 0.07–0.84 ms; adjacent quantifiers operate on disjoint classes (`[A-Za-z0-9-]*` vs `\.`, `\s*` vs emoji) |
| D6 shared-regex `lastIndex` leak | called `assertInert('Ship ✅ now')` six consecutive times | rejected 6/6; `STATUS_EMOJI.global === false`, `lastIndex === 0` after use |
| D6 scanner isolation | two `statusEmojiScanner()` calls, advanced one | distinct objects; `a.lastIndex 3`, `b.lastIndex 0`. All four `sync.mjs` sites (`:90, :93, :124, :148`) call the factory inline |
| Grammar-write surface | enumerated every `writeFileSync` under `roadmap/` and `roadmap-sync/` | 3 writers. `sync.mjs:202` performs emoji substitution only, no free-text interpolation; `epic-store.mjs:43` writes epic-state JSON, not the plan; `backfill.mjs:84` routes through `renderEpicSection`. The "only writer that creates rows" claim holds |
| D7 downstream misclassification | grepped `in_progress` across `.claude/`, `tests/`, `src/`, `site-src/`, `docs/init/` | zero surviving comparisons against the roadmap Status enum. Every hit is an unrelated vocabulary: `design-ui` state machine, `harness/replan.mjs` TaskList statuses, `harness/SKILL.md` `TaskUpdate` prose, test-name literals |
| Secrets hygiene | full diff read | none introduced |

## Dependencies

No new packages. `.claude/skills/lib/epic-heading.mjs` imports nothing — not even a Node builtin.

## Out of scope / Noted

- `.claude/skills/lib/epic-heading.mjs:60-61` — the thrown messages are prefixed `roadmap-append:` although the guard now lives in shared `lib/`. Cosmetic; the prefix preserves the existing message contract the tests match on.
- `.claude/skills/lib/epic-heading.mjs:21,19` — `STATUS_BY_EMOJI` and `STATUS_EMOJI` are exported but consumed only by tests; `parse.mjs:35` keeps an equivalent local map bound to its own exported `Status` enum. Flagged at `/simplify` as a public-API question for a follow-up spec, not a security matter.
- `.claude/skills/lib/tests/probe.test.mjs` is executed by nothing (not `test.cmd`, not `npm test`, not CI). Already backlogged. A test directory beside a security-relevant module that never runs is worth closing.

