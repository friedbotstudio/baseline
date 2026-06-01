# Security reports — improved-backlog-item-detection

## improved-backlog-item-detection-2026-06-01.md

# Security Review — improved-backlog-item-detection — 2026-06-01

## Summary
Risk: **HIGH** (one finding, availability-only, locally reachable). The diff adds two
unanchored regexes to the transcript walker `.claude/hooks/lib/memory_stop.mjs`.
`MARKER_STRIP_GLOBAL` exhibits super-linear backtracking on crafted input that is
reachable through the normal code path, allowing a single ~10 KB transcript line to
stall the Stop hook for 12+ seconds (unbounded as the line grows). No
confidentiality or integrity impact. The fix is cheap (bound the strip input) and
is applied in the same workflow via an in-loop `/tdd` hardening pass.

## Findings

### [HIGH] Catastrophic regex backtracking in `MARKER_STRIP_GLOBAL` (ReDoS)
- **OWASP**: A04 - Insecure Design (resource-exhaustion via regex) | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity), CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/hooks/lib/memory_stop.mjs:96` (`MARKER_STRIP_GLOBAL`), reached via `normalizeIntent` (`:141`) ← `deriveKey` ← the intent loop.
- **Evidence**:
  ```js
  const MARKER_STRIP_GLOBAL = new RegExp(
    String.raw`\s*[([]?\s*\b(?:${BACKLOG_MARKER_BODY})\b(?:\s+too)?\s*[)\]]?[.,;:!?]?`,
    'gi',
  );
  // normalizeIntent runs this global replace on the FULL untruncated matched line:
  const stripped = line.replace(TRIGGER_STRIP, '').replace(MARKER_STRIP_GLOBAL, ' ').trim();
  ```
- **Reachability**: `MARKER_STRIP_GLOBAL` runs only on lines that already matched
  `matchesIntent` (a marker or an anchored trigger). A line such as
  `"<many spaces>" + "add ".repeat(n) + "to backlog"` matches `BACKLOG_MARKER_RE`
  (trailing `add to backlog`), so it passes the gate and is fed verbatim — at full
  length — to the global strip. The `\s*[([]?\s*` leading run plus the long
  alternation whose first branch (`add … backlog`) has many non-completing
  prefixes drives O(n²)-or-worse backtracking as the global scanner retries every
  start position across the garbage prefix.
- **Measured** (empirical, this host): 2.5 KB line → 218 ms; 5 KB → 1.6 s;
  10 KB → 12.1 s; 20 KB → did not finish within 40 s. `BACKLOG_MARKER_RE` itself
  (non-global, single match) stays in single-digit ms and is not the culprit.
- **Impact**: The `memory_stop` Stop hook fires at every turn-end. A transcript
  line of this shape — pasted by the user, or arriving in tool/web output that is
  then echoed into a user/assistant message — makes the hook consume seconds to
  effectively-unbounded CPU on every subsequent Stop, stalling the session. The
  hook's `try/catch` does not bound CPU; a hang is not an error it can swallow.
  Local DoS of the operator's own session; no cross-tenant, data, or integrity
  exposure.
- **Recommendation** (applied in-loop via `/tdd`): bound the working string before
  the strip — `normalizeIntent` should operate on a slice capped at
  `MAX_INTENT_TEXT_LEN` (240), which is already the cap on the stored verbatim and
  far exceeds the 8-word slug window, so no behavior is lost. Additionally tighten
  the leading `\s*[([]?\s*` to `[([]?\s*` to remove the adjacent-quantifier
  amplifier. A regression test asserts a 10 KB marker-matching line is processed
  well under a generous time bound.

## Resolution (applied in-loop, same workflow)
`normalizeIntent` now bounds its working string to `MAX_INTENT_TEXT_LEN` (240) before
the strip, making `MARKER_STRIP_GLOBAL` O(1) in line length. Verified: a 100 KB
crafted line caps to 240 B and strips in ~32 ms (was 12 s at 10 KB / >40 s at 20 KB).
Regression guard `test_when_pathological_long_marker_line_then_bounded_time_and_candidate`
in `tests/memory-stop-recall.test.mjs` asserts a ~15 KB marker line is processed under
an 8 s wall-clock bound while still emitting a candidate. The leading-`\s*[([]?\s*`
regex tightening remains a noted defense-in-depth follow-up (the input cap alone
fully bounds the reachable case). Finding **CLOSED**.

## Dependencies
No new packages. The change uses only `RegExp` from the standard library. `npm audit`
not re-run (no dependency delta in this diff).

## Out of scope / Noted
- `BACKLOG_MARKER_RE` and the pre-existing anchored `INTENT_TRIGGERS` run on full
  untruncated lines too; they measured linear/benign here, but the same input cap
  in `normalizeIntent` (recommended above) plus matching on bounded input would be
  a clean defense-in-depth follow-up. Tracked as a hardening note, not a blocker.
- The verbatim written to `_pending.md` is single-line and prefixed `- Intent: `,
  so it cannot forge a `## CANDIDATE:` / `^##` header line consumed by the dedup
  parser. No injection regression from this diff.

