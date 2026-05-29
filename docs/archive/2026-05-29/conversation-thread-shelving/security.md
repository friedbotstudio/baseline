# Security reports — conversation-thread-shelving

## conversation-thread-shelving-2026-05-30.md

# Security Review — conversation-thread-shelving — 2026-05-30

## Summary

Overall risk: **LOW–MEDIUM**. This is a local, gitignored, model-internal feature with no network surface and no external/untrusted input beyond Claude Code's own session transcript. One **MEDIUM** data-integrity finding (a verbatim cue containing the HTML-comment close `-->` breaks that entry's round-trip, violating AC-007 for that input) and two **LOW** findings (non-atomic state writes; unbounded trail disk growth). No Critical/High. No secrets, no crypto, no new dependencies, no eval/shell.

## Findings

### [MEDIUM] Verbatim cue containing `-->` breaks the entry's JSON-in-HTML-comment round-trip
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-116 (Improper Encoding/Escaping of Output)
- **File**: `.claude/hooks/lib/thread_store.mjs` (renderSection `DATA_OPEN`/`DATA_CLOSE` block; `parseSections`)
- **Evidence**:
  ```
  const DATA_OPEN = '<!-- thread-entry';
  const DATA_CLOSE = '-->';
  const data = `${DATA_OPEN}\n${JSON.stringify(entry)}\n${DATA_CLOSE}`;
  // parseSections: finds DATA_OPEN, then the NEXT '-->'
  const close = text.indexOf(DATA_CLOSE, open + DATA_OPEN.length);
  ```
- **Impact**: `JSON.stringify` does NOT escape the 3-byte sequence `-->` (it isn't a JSON metacharacter). If a captured verbatim cue (the user's own conversation text) contains `-->`, the rendered data block contains a premature `-->`; `parseSections` stops at it and `JSON.parse` receives a truncated string → the block fails to parse → that thread entry is silently dropped on read. This violates **AC-007** (byte-identical verbatim round-trip) for any cue containing `-->`, and would drop the most-recent section from SessionStart injection / resume. Graceful (try/catch → entry skipped, no crash or code execution), self-inflicted, local — hence MEDIUM not High. The AC-007 test exercises em-dash/backticks/unicode/emoji but NOT `-->`, so the gap is uncovered.
- **Recommendation**: Make the data block delimiter-safe. Cleanest: base64-encode the entry JSON inside the comment (`Buffer.from(JSON.stringify(entry)).toString('base64')`, decode on parse) so no payload byte can collide with `-->`. Add an AC-007 test case with a cue containing `-->` and `<!-- thread-entry`.
- **RESOLVED (2026-05-30)**: Fixed in `thread_store.renderSection`/`parseSections` — the entry JSON is now base64-encoded inside the data block (base64 alphabet has no `-`). Regression test added: `test_when_cue_contains_comment_delimiter_then_entry_still_round_trips`. Also hardened the adjacent v1 polish bug where the shipped `src/memory/_thread.template.md` doc-comment contained a literal `## SHELVED` heading that `readMostRecentMarkdown` falsely surfaced at SessionStart — the template now describes the format in prose with no literal anchors.

### [LOW] Non-atomic state writes (cursor / candidate / transform-cache / trail append)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-362 (Concurrent Execution / partial write)
- **File**: `.claude/hooks/lib/thread_store.mjs` (`writeJson` → `writeFileSync`; `appendEntry` → `appendFileSync`), `.claude/hooks/lib/resume_transform.mjs` (`writeCache` → `writeFileSync`)
- **Evidence**:
  ```
  function writeJson(path, obj) { ...; writeFileSync(path, JSON.stringify(obj, null, 2)); }
  appendFileSync(path, '\n' + renderSection(entry));
  ```
- **Impact**: A crash/kill mid-write can leave a truncated `thread_cursor.json` / `shelve_candidate.json` / `thread_transform_cache.json`, or a partial trailing `_thread.md` section. **Self-healing by design**: `readJson`/`readCache` catch parse failure → return null → callers fall back (null cursor → whole-transcript fallback; null cache → recompute; `parseSections` skips an incomplete trailing block). No data loss of *prior* entries (append-only), no corruption propagation. Lower impact than the analogous backlog item `workflow-migrator-write-not-atomic` (that risks the live workflow tracker; this degrades gracefully).
- **Recommendation**: Optional hardening — write-to-temp-then-rename for the JSON sidecars (cursor/candidate/cache), matching `common.mjs writeMarkerAtomic`. Append to `_thread.md` is acceptable as-is given the tolerant parser. Defer unless observed.

### [LOW] Unbounded trail disk growth
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/hooks/lib/thread_store.mjs` (`appendEntry`), `.claude/memory/_thread.md`
- **Evidence**: `_thread.md` is append-only and explicitly excluded from `/memory-flush`'s reset path (by design — durability).
- **Impact**: The trail grows without bound on disk over a long-lived project. SessionStart **injection** is bounded (only the most-recent section, ≤ ~10KB envelope — AC-009) and per-entry capture is bounded (`MAX_CUES`/`MAX_FILES`/`MAX_OPEN_QUESTIONS`), so context/runtime cost is bounded; only on-disk size is unbounded. Local, gitignored, low practical impact.
- **Recommendation**: Track intake OQ-1 (bounding/lifecycle) — a size-cap + roll-off of oldest sections (or a cold `_thread.archive.md`) in a follow-up. Not required for v1.

## Dependencies

No new packages in this diff. Implementation uses only Node built-ins (`node:fs`, `node:path`, `node:child_process`). `npm audit` not re-run (no dependency change). No CVE surface introduced.

## Out of scope / Noted

- **No shell / no eval**: the feature helpers perform no `spawnSync`/`exec`; transcript reading is `fs.readFileSync` + `JSON.parse` per line with per-line try/catch. No command injection surface.
- **Path handling is internally derived**: `memDir`/`stateDir` come from `CLAUDE_DOTDIR` (project root); `transcript_path` is Claude Code's own session transcript path (not user-supplied). Fixed filenames joined to those dirs — no path-traversal vector from external input.
- **Detector DoS**: `readEvents` reads the whole transcript into memory (same as the existing `resume_writer`), bounded by session size; `tokens()` uses a linear `[^a-z0-9\s]` replace + split (no ReDoS). No new DoS surface vs. the existing memory hooks.
- **Best-effort contract**: `shelve_detect` is folded into `memory_stop` inside a try/catch and emits nothing on stdout, preserving `harness_continuation`'s sole Stop-event block decision (no control-flow tampering).

