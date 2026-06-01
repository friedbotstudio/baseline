# Security reports — thread-trail-rolloff-cap

## thread-trail-rolloff-cap-2026-06-01.md

# Security Review — main (thread-trail-rolloff-cap) — 2026-06-01

## Summary
Risk: **MEDIUM**. The diff adds a count-based roll-off (`pruneTrail`, wired into
`appendEntry`) to the local `_thread.md` trail. One MEDIUM data-integrity finding —
slice-based eviction counts `## SHELVED` heading lines, which a multi-line verbatim
cue can forge, causing a surviving section to be wrongly evicted — is fixed in-loop by
rebuilding from the forge-proof base64 data-block parse. The atomic temp+rename is
sound; the heading regex is linear (no ReDoS); no secrets, no new dependencies.

## Findings

### [MEDIUM] Phantom `## SHELVED` heading in a cue causes wrongful section eviction (data loss)
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-20 (Improper Input Validation — unneutralized section delimiter in the parser)
- **File**: `.claude/hooks/lib/thread_store.mjs` — `pruneTrail` (original slice-on-heading implementation).
- **Evidence** (original):
  ```js
  const heads = [...text.matchAll(/^## SHELVED .*$/gm)];
  if (heads.length <= maxSections) return { kept: heads.length, evicted: 0 };
  const survivors = text.slice(heads[heads.length - maxSections].index)...
  ```
  A section's `### Verbatim cues` block renders each cue as `> ${cue}`. Only the FIRST
  line of a multi-line cue gets the `> ` prefix; a subsequent line that begins
  `## SHELVED ` is therefore a bare line that matches the heading regex.
- **Reachability** (confirmed): with 3 real sections and `maxSections: 3` (a no-op),
  a section-1 cue of `"code review:\n## SHELVED phantom in a surviving section"`
  inflates the heading count to 4, triggers eviction, and slices from the phantom —
  dropping section 1's data block:
  ```
  real sections after appending 3 (cap 3, expect 3): 2 [ 's2', 's3' ]
  s1 survived? NO -- s1 WRONGLY EVICTED (data loss)
  ```
- **Impact**: Silent loss of a continuity section that should have survived, and a
  trail left in a partial state (a kept slice can start mid-section). Local only — no
  disclosure, no boundary crossed — but the trail is the cross-session memory this
  feature exists to protect, and the cue text is attacker/operator-influenceable
  (any transcript span). Especially live in this meta-repo, where `## SHELVED`
  appears verbatim in code and reviews.
- **Recommendation** (applied in-loop): evict by parsing the authoritative sections
  via the base64 data-block delimiter (`parseSections`, which already decodes and
  skips any forged `<!-- thread-entry` in a cue), keep the most-recent N, and rebuild
  the file by re-rendering those entries (deterministic; round-trips byte-identical).
  This removes all dependence on the forgeable heading line.

## Resolution (applied in-loop, same workflow)
`pruneTrail` now calls `listSections` (base64 data-block parse), keeps the last
`maxSections` entries, and rebuilds the trail as `TRAIL_HEADER + keep.map(renderSection)`
under the same atomic temp+rename. Regression guard
`test_when_phantom_heading_in_cue_then_no_wrongful_eviction` asserts 3 real sections at
cap 3 (one carrying a `## SHELVED` cue line) are all retained. Finding **CLOSED**.

## Dependencies
No new packages. Node stdlib only (`node:fs`, `node:path`).

## Out of scope / Noted
- **Atomic write — checked sound.** `pruneTrail` writes `path + '.tmp'` then
  `renameSync` (atomic on POSIX, same directory). Single-writer model (one model-driven
  shelve path per session), so the read→rename window is not a realistic TOCTOU. The
  fixed `.tmp` name (CWE-377, predictable temp file) matches the existing
  `writeJsonAtomic` convention and is bounded by the same trust model — writing into
  `.claude/memory/` already implies local repo write access. LOW, not fixed (consistent
  with existing code).
- **Heading regex — no ReDoS.** `/^## SHELVED .*$/gm` is anchored with no nested
  quantifiers; `matchAll` is O(n). After the fix, eviction no longer depends on it.
- **Pre-existing: `readMostRecentMarkdown` heading slice.** This read-only helper
  (not introduced by this diff) also slices from the last `## SHELVED` heading and
  would mis-slice if the newest section's cue contains a phantom heading line. No data
  loss (read-only); the authoritative resume path uses `parseSections`/`readMostRecent`
  which are unaffected. Flagged for a future hardening; out of scope for the roll-off
  cap.

