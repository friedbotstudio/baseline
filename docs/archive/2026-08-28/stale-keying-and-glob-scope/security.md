# Security reports — stale-keying-and-glob-scope

## stale-keying-and-glob-scope-2026-08-27.md

# Security Review — stale-keying-and-glob-scope — 2026-08-27

## Summary

Overall risk: **MEDIUM**. No Critical or High findings. The new `surfaces-on:` field carries path globs into the same regex compiler `governs:` already used, and it **inherits that compiler's existing protections** — the `MAX_WILDCARDS` cap and the metacharacter handling both apply, verified empirically. One MEDIUM finding is a **pre-existing** unvalidated-write path in `applyNarrowing` that this change extends to a third field without creating it. One LOW is a defense-in-depth gap against a path shape the caller cannot currently produce.

Every claim below was tested against the running code rather than read off the source.

## Findings

### [MEDIUM] `applyNarrowing` writes frontmatter values without validation, and the parser is last-wins

- **OWASP**: A03 — Injection | **CWE**: CWE-93 (CRLF Injection), CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/memory-index/scope-narrow.mjs:71-86`
- **Evidence** — all three parameters inject, including the two that pre-date this change:

  ```
  governs    (PRE-EXISTING param): verified-at lines = 2  <-- INJECTED
  scope      (PRE-EXISTING param): verified-at lines = 2  <-- INJECTED
  surfacesOn (NEW param)         : verified-at lines = 2  <-- INJECTED
  ```

  A value containing a newline is written straight into the frontmatter block:

  ```
  surfaces-on: .claude/**
  verified-at: 0000000
  ```

- **Impact**: the forged key **wins**. `parseFrontmatter` is last-wins — confirmed: with a real `verified-at: abc1234` above and a forged `verified-at: 0000000` below, the parser returns `0000000`. `verified-at` is the staleness witness, so forging it makes an entry read as verified at a commit it was never checked against, and the entry silently stops decaying. `scope:` and `governs:` are forgeable the same way, which would silently change where an entry surfaces.

  Reachability is **local, not remote**: `applyNarrowing` is called by the `scope-narrow` CLI and by a curator during `/memory-sync`. The realistic vector is a contributor-authored memory entry whose value round-trips through a narrowing run, not an external attacker. That is what holds this at MEDIUM.

- **Recommendation**: route all three values through `assertSafeFieldValue` from `migrate.mjs:64`, which `constraints.mjs:65` already uses on this exact field name for this exact reason. One line per parameter. **This is pre-existing and not introduced here** — `governs:` and `scope:` have been writable this way since `applyNarrowing` was written — so it does not block this landing, but it should not be left open either. Recorded for the backlog.

### [LOW] The surfacing globs are not traversal-sanitised, unlike the write-surface leg

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/hooks/lib/memory-entries.mjs:surfacingPathsOf`
- **Evidence**: a `../../../etc/passwd` glob matches a `../../../etc/passwd` needle, and an absolute `/etc/passwd` glob matches an absolute needle.
- **Impact**: **not currently reachable.** The needle is always a repo-relative path — `process_lifecycle_guard` normalises the payload's absolute `file_path` through `repoRelative()` before either lookup, and `seed.md` states that both lookups match relative anchors. With no traversing needle, a traversing glob matches nothing. The consequence if that normalisation ever regressed is a memory entry surfacing on a path outside the repository, which discloses entry content rather than granting access.
- **Recommendation**: mirror `write-surface.mjs`, which drops absolute paths and `..` segments *before* any match rather than relying on the caller having normalised. Defense in depth; the guarantee currently lives in one caller instead of at the boundary.

## Checked and clean — with what was actually run

- **Glob injection into the regex compiler (A03 / CWE-1333)** — `?`, unbalanced `(`, and `(a+)+$` through `surfaces-on:` all return `false` in under 2ms. No throw, no bare value reaching the `RegExp` constructor. The two findings recorded in `index-io.mjs`'s own comments are fixed and the new field sits behind the same fix.
- **ReDoS (CWE-1333)** — 13 wildcards (over `MAX_WILDCARDS = 12`) returns `false` in 0.0ms; the cap applies to the new field because it reaches the same `matchesGlob`. The whole probe set completed in well under the 30s harness timeout. `surfaces-on:` does **not** open a second path into the compiler that skips the cap, which was the specific concern.
- **The `isReachable` widening (A01)** — not a security weakening. `assertWritable` refuses an unreachable entry for a **curation** reason: an entry nothing can surface is dead weight. The third disjunct makes strictly more entries writable and removes no check. An entry with all three legs empty still throws, which is pinned by `test_when_all_three_legs_are_empty_then_assert_writable_still_throws`.
- **Secrets hygiene** — no tokens, keys, or `.env` references in the diff.
- **Dependencies** — none added. The repo enforces empty `dependencies`; the only new import is an internal one (`categories.mjs → asList`).

## Dependencies

No new packages. Nothing to CVE-check.

## Out of scope / Noted

- The MEDIUM above is genuinely repo-wide rather than specific to this diff: `applyNarrowing` has never validated any of its three field values. Worth a backlog entry naming `assertSafeFieldValue` as the fix and `constraints.mjs:65` as the precedent.
- `tests/memory-security-followup.test.mjs` covers the malformed-glob path for `governs:`. It does not yet exercise `surfaces-on:`. The protection is shared so coverage is not strictly required, but a test naming the new field would keep it that way.

