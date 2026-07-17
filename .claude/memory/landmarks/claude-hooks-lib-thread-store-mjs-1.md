---
key: .claude/hooks/lib/thread_store.mjs:1
category: landmarks
scope: [scout]
---

- Role: Foundation helper for the durable local conversation-thread trail (`.claude/memory/_thread.md`, Article IX clause 8). Reads/writes shelved-thread sections; entry JSON is **base64-encoded** inside an HTML-comment data block so verbatim cues round-trip even when they contain the `-->` close delimiter (a security MEDIUM fixed during the feature). Exports include `readMostRecentMarkdown({memDir})` used by `memory_session_start` to inject only the most-recent section at SessionStart. **Bounded** (2026-06-01): `appendEntry` calls `pruneTrail` after each shelve, evicting oldest sections so at most `THREAD_MAX_SECTIONS` (default 20) remain. `pruneTrail` parses sections via the base64 data block (`parseSections`) — NOT the `## SHELVED` heading, which a multi-line verbatim cue can spoof (a security MEDIUM: phantom-heading wrongful eviction, fixed in this change) — and rebuilds the trail under an atomic temp+rename so survivors stay byte-identical.
- Companion: `.claude/hooks/lib/shelve_detect.mjs`, `shelve_capture.mjs`, `resume_transform.mjs` (the shelve/resume pipeline); folded detector in `memory_stop.mjs`. Tests: `tests/thread-trail-rolloff.test.mjs` (cap + phantom-heading guard), `tests/thread-shelving.test.mjs`.
- Caveat: `readMostRecentMarkdown` still slices on the `## SHELVED` heading and would mis-slice if the newest section's cue contains a phantom heading line — read-only, no data loss; the authoritative resume path (`readMostRecent`/`parseSections`) is unaffected. Flagged for future hardening (security report archived 2026-06-01).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
