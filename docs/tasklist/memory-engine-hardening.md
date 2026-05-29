# Memory engine hardening — batch tasklist

Workflow: `memory-engine-hardening` (freeform track)
Created: 2026-05-28
Source: 14 findings from /clear-time review of the memory subsystem (`.claude/memory/`, `memory_*` hooks, `memory-flush` skill).

Each item is sized for an independent fix. Pick step-by-step; rerun freeform / chore / tdd as appropriate per item. Strike through completed items and append the landing commit SHA.

---

## P0 — Active bugs (do first)

- [x] **#1 — Dedup regex captures wrong key.** ~~`.claude/hooks/lib/memory_stop.mjs:122` regex `^##\s+CANDIDATE:\s*(\S+)` only grabs the path token before ` → target.md`.~~ Fixed by widening to `^##\s+CANDIDATE:\s*(.+?)\s*$`. Regression test at `tests/memory-stop-dedup.test.mjs` covers cross-invocation dedup on both landmark and backlog candidates. `_pending.md` body reset to skeleton.

- [x] **#2 — Closure detection misaligned with how entries are actually closed.** ~~Entries use `## Q-005 — CLOSED 2026-05-16` heading suffix + `- Resolution: ...` body; neither matched.~~ Fixed by (a) extending `sweep.mjs modeAutoClose` to detect `— CLOSED YYYY-MM-DD` (em-dash or ASCII `--`) in the heading as equivalent to the structured field; (b) adding R4 prose pattern `^(\s*-\s*)?\*{0,2}Resolution\s*:` so `- Resolution:` body bullets surface in prose-scan. 5 new tests in `.claude/skills/memory-flush/tests/run.sh`. **Note:** README still documents the structured-field style only — #14 below now narrows to "decide whether to document the heading-suffix style as canonical or normalize entries to the structured form at /memory-flush write time".

## P1 — Decay / discipline holes

- [x] **#3 — `verified-at: HEAD` is a permanent decay-evasion hatch.** ~~`memory_session_start.mjs:94` and `sweep.mjs:172` short-circuit staleness when `stamp === 'HEAD'`.~~ Fixed by removing the `!head` guard around the date-based fallback — HEAD-stamped entries now fall through to `last-touched`-days check regardless of git-ness. The byte-equal AC-008 fixture was regenerated to absorb the intended drift (5 newly-stale entries surfaced: libraries +2, decisions +2, landmines +1). 3 new node tests + 3 new shell tests cover the git path with HEAD stamp + old/fresh/real-SHA combinations.

- [x] **#4 — `landmarks.md` exceeds its declared `size-cap: 500`** (currently 513 lines / 66 entries). ~~Pruning is documented but not enforced on write.~~ Fixed by extending `memory_session_start` index to (a) compute line count vs declared cap per file, (b) flip Status column to `over-cap` when exceeded, (c) append a `## Files over size-cap` section listing offenders worst-first with the README guidance line. No new hook (preserves "22 hooks" count) — the surface is the existing session-start index. 4 new node tests cover within-cap silence, over-cap surface, worst-first ordering, and default-cap fallback.

- [x] **#5 — Backlog growth has no enforced pruning policy.** ~~Stale-exempt + `verifies-against: none` + no `status: dropped` sweep.~~ Fixed by adding a `backlog-decay` mode to `sweep.mjs` (Step 0d in the `/memory-flush` SOP). For each open backlog entry whose `raised-on:` is older than `--threshold-days` (default 90), the curator decides `keep / drop / picked-up / skip`. `drop` and `picked-up` stamp `status:` + `superseded-at:` so the next Step 0a auto-close removes them. `--threshold-days` is configurable per invocation. 5 new tests cover threshold, all three replies, and the closed-entry-skip case.

## P2 — Signal quality

- [x] **#6 — Path-touched landmark candidates are chaff.** Fixed with option (c): landmark candidates emit only on (Write event) OR (edit count >= `LANDMARK_EDIT_MIN` = 3). Brand-new files surface immediately; single drive-by edits no longer pollute pending. Added `Trigger:` line to disambiguate the cause.

- [x] **#7 — Intent regex set is narrow.** Widened with 5 new anchored patterns mined from this repo's backlog verbatims: `we (need to|should|must|ought to|have to)`, `(cure|mitigation|remediation|remedy):`, `follow-up:`, `future work:`, numbered-action lists `N. (add|fix|update|...) ...`. Precision regression traps verify mid-sentence cases still don't fire.

- [x] **#8 — No `source:` provenance on auto-emitted candidates.** Auto-extractor stamps `source: inferred-from-code` on landmark candidates and `source: library-pinned` on library candidates. Bundled with #6.

## P3 — Continuity gaps

- [x] **#9 — Pending-nag is workflow-conditional.** Now fires regardless of `workflow.json` state with framing per case (prior-workflow vs current-session). Added a non-blocking advisory line to `/grant-commit` SOP that names the pending count. Memory is harness-local — never blocks commits.

- [x] **#10 — Resume snapshot truncates aggressively.** Doubled the caps: `MAX_USER_PROMPTS` 3 → 6, `MAX_FILES` 12 → 24, `MAX_SKILLS` 5 → 10, `MAX_BASH` 5 → 10, `USER_PROMPT_CHARS` 400 → 800. The 10KB envelope budget at line 240 still enforces the upper bound.

- [x] **#11 — Resume freshness cuts off hard at 7 days.** Dropped the 7-day gate. Snapshots surface regardless of age with `(snapshot age: <N>d — verify before relying)` framing when > 7d. Added a mid-flight workflow callout: when `workflow.json` exists and `completed[]` doesn't include `commit`, surfaces "Workflow `<slug>` is mid-flight — `/harness` to resume, `/triage` to abandon".

## P4 — Smaller things

- [x] **#12 — `Q-NNN` IDs have no allocator.** Added `.claude/skills/memory-flush/next-q-id.mjs`. Reads `pending-questions.md`, returns max+1 zero-padded. Counts CLOSED entries against the max so a closed Q-007 still increments to Q-008. Memory-flush SOP references the allocator in the defer step.

- [x] **#13 — `stripFrontmatter` brittle to body horizontal rules.** Replaced `indexOf('---')` with line-anchored lookup for both `memory_session_start.mjs → stripFrontmatter` and `sweep.mjs → splitEntries`. A `---` substring in a frontmatter body field no longer truncates content. Tests cover tricky-frontmatter cases and clean-case sanity.

- [x] **#14 — README vs. practice drift on closure style.** `docs/init/seed.md` is silent on closure style, so per the user's protocol the README was updated to document both forms as first-class: Form A (structured `resolved-at:` / `superseded-at:`) and Form B (heading suffix `— CLOSED <date>`). R4 prose pattern documented alongside R1-R3.

---

## Execution notes

- All 14 items can be picked individually; no hard ordering dependency.
- #2 + #14 pair naturally (one is the bug, the other is the doc).
- #4 + #5 pair naturally (both touch size/decay invariants).
- #6 + #7 + #8 pair naturally (all touch the auto-extractor's output quality).
- #1 is the highest-ROI fix because it's the visible operational drag in `_pending.md` right now (24 "pending" candidates are really 4 unique × 6 dupes).
- After each fix lands, append the commit SHA in `(commit <sha>)` format next to the checkbox.
