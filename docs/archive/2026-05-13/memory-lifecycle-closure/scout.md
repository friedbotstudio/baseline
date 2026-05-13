# Codebase Scout Report — memory-lifecycle-closure

Surface map for the three-part lifecycle change: resolution semantics, per-entry stale listing, and canonical sweep in `/memory-flush`. Intake at `docs/intake/memory-lifecycle-closure.md`.

## Primary touchpoints

- `.claude/memory/README.md:37-50` — **per-entry shape** (canonical files). Defines the markdown block schema with `source`, `verbatim`, `verified-at`, `last-touched`, `caveat`. AC-1, AC-5, AC-6 land here: the new field (`resolved-at:` / `superseded-at:` per Open Q #2 recommendation) joins the existing fields without displacing the verbatim blockquote. Touched by **Document** phase, not by phase code.
- `.claude/memory/README.md:69-73` — **Bounding rules** (size-cap + decay). AC-5 needs this section to clarify the closure/staleness split.
- `.claude/memory/README.md:18-35` — **Source provenance** table + verbatim rule. Out of scope per intake's Open Q #1, but the new field must coexist with this contract — call out in the spec.
- `.claude/memory/pending-questions.md:1-25` — **primary lifecycle target.** Currently 1 entry (Q-001). Frontmatter declares `verifies-against: none`. AC-1/AC-2/AC-6 directly act on entries here.
- `.claude/memory/landmarks.md:1-149` (19 entries), `libraries.md` (43L, 3 entries), `decisions.md` (26L, 1 entry), `landmines.md` (75L, 5 entries), `conventions.md` (70L, 3 entries) — **secondary lifecycle targets** if Open Q #2 resolves to "universal `superseded-at:` on the other five files." Spec decides shape; if scoped only to `pending-questions.md`, these files are out of scope for code changes (still touched by docs).
- `.claude/memory/_pending.md:1-13` — pending inbox. No code change; spec verifies skeleton is untouched.
- `.claude/hooks/memory_session_start.sh:39-196` — **index emitter.** The python heredoc at lines 39-188 builds the markdown block. AC-3 / AC-5 / AC-8 land at:
  - Lines 63-100: per-file loop. The block scanner at line 80 (`blocks = re.split(r'(?m)^##\s', body)[1:]`) is already iterating entry blocks — extend to collect each stale entry's stable key for the new list.
  - Lines 75-99: SHA-distance stale check. AC-5 needs an additional filter: an entry with `resolved-at:` set should be excluded from the stale count regardless of `verified-at` age.
  - Lines 110-135: index composition. AC-3 adds a `## Stale entries` block AFTER the existing table (additive — preserves AC-8 backwards compatibility).
  - Line 113: the canonical header line `HEAD: ... total entries: N · stale (>=30 commits old): M` — SHALL stay byte-equal per AC-8.
  - Lines 138-140: 2KB index cap. New stale-list block fits within this budget; spec sizes it (≤ 5 entries × ~80 chars ≈ 400 chars).
- `.claude/hooks/memory_stop.sh:1-173` — **read-only context.** Passive collector, writes only to `_pending.md`. No edits expected, but the docs phase may note the new schema for landmark-candidate stamps if relevant.
- `.claude/hooks/memory_pre_compact.sh:1-36` — **read-only context.** Writes `_resume.md` only. No edits expected.
- `.claude/skills/memory-flush/SKILL.md:23-110` — **curation SOP.** AC-1/AC-2/AC-4 land here:
  - Step 2 outcomes (lines 29-35): list grows from 3 (Promote/Discard/Defer) → 4 (+ Close). Close applies to *existing canonical entries*, not _pending candidates.
  - New Step 0 (sweep canonical for closure): runs BEFORE Step 1 (Read everything). Scans each canonical file for entries with `resolved-at:` (auto-close per AC-1) or matching the resolution-prose regex (surface-and-confirm per AC-2). Spec decides exact regex; intake suggests `^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b` case-insensitive.
  - New Step 0a (sweep stale): when SessionStart reported stale entries (passed in via context, not by re-reading the hook output — the skill reads canonical files directly and re-applies the same stale predicate), offer re-verify / delete / mark-closed per AC-4.
  - Step 6 report shape: grows a `Closed (M)` block plus optionally a `Stale handled (P)` block.
- `.claude/skills/audit-baseline/audit.sh:32-79` — **binding test.** AC-7 verifies the audit still PASSes after the changes. Audit currently does not inspect per-entry shape (verified by `grep -n "verified-at\|last-touched\|resolved" audit.sh` → empty); only checks file presence, frontmatter presence, and `## ` entry count > 0. So adding `resolved-at:` to entries is invisible to the audit; adding a new memory file would break it (not in scope).
- `src/memory/*.template.md` — **8 parallel templates** (`_pending`, `_resume`, plus the 6 canonical). The audit at `audit.sh:443-460` checks each template's frontmatter. If the frontmatter on `pending-questions.template.md` changes (e.g., to declare a `resolved-at` convention), the live `pending-questions.md` and the template must move in lockstep. If only the per-entry body shape changes (no frontmatter change), templates are unaffected. Spec decides whether to update template frontmatter or document the convention only in `README.md`.

## Entry points that reach this code

- **SessionStart hook fires automatically** when a session begins (`compact` / `clear` / `resume` / `startup`). User does not invoke. The hook reads `_resume.md` for cross-session continuity and emits the index into `additionalContext`.
- **`/memory-flush`** is the user-invoked entry point for curation. Today triggered by the SessionStart "K candidates pending" line or directly by the user. After this work, also triggered by the new "N stale entries" or "M resolved entries" lines.
- **Phase skills cite memory entries** (via Article IX clause 2 re-verify-before-cite). Today only landmarks/libraries/decisions/landmines/conventions are cited by `scout`/`research`/`spec`/`scenario`/`implement`. `pending-questions.md` is never cited by any phase skill — confirmed by grep across `.claude/skills/*/SKILL.md`: no skill references `pending-questions.md` programmatically. That's the structural reason questions accumulate.

## Existing tests

- **`.claude/skills/audit-baseline/audit.sh`** is the project's binding test runner (per `project.json → test.cmd`). 919 lines. Passes today; AC-7 requires it still passes after the change. Audit does NOT validate per-entry shape today (no checks on `verified-at` / `last-touched` / `source:` fields).
- No unit tests for the hook output format. AC-8 (header line byte-equality) needs a new fixture-based test in the spec, or a smoke check via running `memory_session_start.sh` against a stubbed memory dir.
- No tests for `/memory-flush` flow today (skills are conversational by design). AC-1/AC-2/AC-4 need either a SOP review (spec says "the skill follows the documented Step 0/Step 2 outcomes") or a fixture-based integration test that pre-seeds a canonical entry with `resolved-at:` and asserts the skill removes it.

## Constraints and co-changes

- **AC-8 backwards compatibility.** The canonical header line at `memory_session_start.sh:113` is the de facto schema for the index. New output (`## Stale entries` block) must go BELOW that line, not interleaved. Old `_resume.md` snapshots that quote the header line must still parse.
- **2KB index cap** (`memory_session_start.sh:139-140`). New stale-listing block must fit. Top-5 cap with `… and N more` overflow indicator (per AC-3) keeps worst-case under ~500 bytes.
- **Per-entry shape preservation.** README.md schema lines 37-50 reserves slots for `source`, `verbatim` (blockquote), key/value fields, `verified-at`, `last-touched`, `caveat`. The new field SHALL be a key/value line and SHALL NOT displace the verbatim blockquote (which must remain immediately under the `##` heading per source-provenance contract).
- **size-cap: 500** per canonical file. Closing entries REDUCES line count (entries get deleted); this rule is unaffected.
- **Non-git mode.** This codebase has no `.git/`. The stale-detection at `memory_session_start.sh:78-98` already short-circuits to `if head:` when git is absent — total_stale stays 0. AC-3's stale-listing must use date-based fallback (`last-touched` ≥ 90 days) when SHA-distance is unavailable. The current code does not implement date-based decay; the spec must specify how AC-5's "fresh `verified-at:` SHA" reads on non-git (recommendation: treat `verified-at: HEAD` as fresh, and any explicit ISO date in `last-touched` ≥ 90 days as stale).
- **No new hooks** (CLAUDE.md Article VIII — 22 hooks total). Article XI (skill ownership) is unaffected — `memory-flush` is already `owner: baseline`.
- **`src/CLAUDE.template.md` byte-equal mirror** (Article XI clause 4). If CLAUDE.md's Article IX text changes (e.g., new clause on closure semantics), the template mirror must move in lockstep. Spec decides whether the change is documentation-only or warrants a clause edit.
- **Audit's `EXPECTED_MEMORY_FILES` set** (`audit.sh:70-79`) enumerates the 8 memory files. Not changing — no new file is created by this work.

## Patterns in use here

- **Frontmatter + body split.** Each canonical file opens with `---`-delimited YAML-ish frontmatter declaring `owners`, `category`, `size-cap`, `key`, `verifies-against`. Body starts after the second `---`. Hooks and skills both use `text.split('---', 2)[-1]` to skip frontmatter.
- **`## <stable-key>` entry headings.** Each entry is a level-2 heading whose text is the stable key. Entry blocks run from one `## ` to the next (or EOF). Both `memory_session_start.sh:71` and `audit.sh:309` use this convention to count entries.
- **Field shape inside entry: `- <field>: <value>`.** Markdown list with colon-separated key/value. The hook's regex `r'verified-at:\s*([A-Za-z0-9]+|HEAD)'` at line 82 already demonstrates how to extract a field; AC-1 and AC-5 use the same approach for `resolved-at:`.
- **Verbatim blockquote** under the heading: `> verbatim (user, <ISO date>):\n> <text>`. Required for `source: user-instruction` / `user-feedback`. The new `resolved-at:` field comes AFTER the verbatim block (as a regular key/value line in the field list).
- **Skill-driven, conversational curation.** `/memory-flush` runs in main context — it asks the user, edits files, writes a report. No deterministic CLI invocation. Spec's test strategy must reflect this (SOP review or fixture-based + checklist, not pytest-style assertions on the skill itself).
- **Hook safety: never fail.** Both `memory_stop.sh` and `memory_session_start.sh` use `|| true` and silent-exit patterns. AC-3's new code path SHALL follow this — a parse error on one stale entry must not abort the whole index.

## Risks / landmines

- **Verbatim blockquote placement is load-bearing.** README.md line 35 says "When verbatim and interpretation conflict, verbatim wins." The blockquote must immediately follow the `## <key>` heading, before the field list. Spec must explicitly state the new `resolved-at:` line goes inside the field list (below the blockquote, alongside `verified-at:` / `last-touched:`), not between the heading and the blockquote.
- **Existing entries without `resolved-at:` SHALL survive.** AC-6 is explicit but worth re-flagging: the canonical sweep in `/memory-flush` Step 0 SHALL only act on entries that have an *affirmative* `resolved-at:` value or matching prose. Absence of the field is the default for the 23 existing entries and means "still open."
- **Resolution-prose regex is fuzzy.** AC-2 specifies one pattern; real entries might say "Resolved 2026-04-29:" or "Resolution: ..." with different formatting. Spec must define the exact regex set; recommend a generous one that catches all common shapes, but never auto-closes — always surface-and-confirm (per intake Open Q #3).
- **Non-git fallback is silent today.** `memory_session_start.sh:54` swallows the git failure and sets `head = ''`. AC-5's "fresh verified-at SHA" predicate on non-git needs a deliberate decision (recommendation per Constraints above: `verified-at: HEAD` = fresh; `last-touched: <date>` < 90 days = fresh).
- **Q-002 / Q-003 are now gone from `pending-questions.md`.** Today's manual deletion removed the historical evidence. The intake's Problem section quotes them; the spec/tests should use *synthetic* fixtures (a constructed entry with `resolved-at: 2026-05-01`), not rely on the deleted entries.
- **`src/memory/pending-questions.template.md` may need a frontmatter update.** If the spec adds a new key convention to frontmatter (e.g., `closure: resolved-at`), the template at `src/memory/pending-questions.template.md` must move in lockstep with the live file. If the spec keeps the new field purely as a per-entry body convention documented in README.md, templates stay unchanged.
- **AC-7 is the only binding test.** `audit.sh` doesn't validate per-entry shape today, so the audit will PASS the changes regardless of whether the new field is correctly placed. The spec's test strategy should compensate — either by adding a per-entry-shape check to `audit.sh` (extends Article XI surface) or by accepting that AC-1/AC-2/AC-3 verify via fixture-based integration (running the hook + skill against a stubbed memory tree).
