# Security reports — velocity-envelope-derives

## velocity-envelope-derives-2026-08-26.md

# Security Review — main — 2026-08-26

## Summary

Overall risk: **LOW**. Two changes reviewed. The first moves four numbers on a documentation page from hardcoded literals to build-time values derived from `envelopeFor`. The second adds a guard that decides whether `/archive` invalidated the binding test verdict, and re-runs the suite when it did. The guard takes a slug into a filesystem path, which is the one real boundary in this diff; it was probed and rejects every malformed form.

## Findings

### [LOW] The slug reaches a path, and is validated before one is built

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/archive/reverify-guard.mjs:25`
- **Evidence**:
  ```js
  export function assertSafeSlug(slug) {
    if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
      throw new Error(`archive reverify-guard: refusing an unsafe slug ${JSON.stringify(slug)}`);
    }
    return slug;
  }
  ```
- **Impact**: `snapshotPath` writes to `.claude/state/archive-reverify/<slug>.json`. Without validation a traversing slug would write outside that directory. `assertSafeSlug` runs inside `snapshotPath`, so it fires before any path is constructed, on both `capture` and `decide`. Probed with `../../etc/passwd`, `a/../../b`, `.hidden`, `UPPER`, `with space`, `--output=x`, the empty string and `null`: all eight rejected, `ok-slug` accepted.
- **Recommendation**: None. Keep it REJECT rather than repair — normalizing a malformed slug writes to a different path than the caller named and hides the mistake. This is the same call the `plan-store` guard makes, and the reason is recorded in `docs/security/durable-plan-slug-guard-2026-07-12.md`.

### [LOW] The guard can only ever weaken verification by failing closed, which it does not

- **OWASP**: A04 - Insecure Design | **CWE**: CWE-754
- **File**: `.claude/skills/archive/reverify-guard.mjs:60`
- **Evidence**:
  ```js
  try { stored = JSON.parse(readFileSync(snapshotPath(rootDir, slug), 'utf8')).digest; }
  catch { return { ...REVERIFY, reason: 'no readable pre-archive snapshot' }; }
  ```
- **Impact**: The failure that matters here is a false SKIP — a verdict that does not cover the tree being committed, reported as if it did. Every path that cannot prove a match returns re-verify: absent snapshot, corrupt snapshot, unreadable archive tree, a stored value that is not a string, and an unrecognised CLI command. The skip is returned from exactly one place, after an equality test on two digests computed the same way. Four tests pin the failure paths and one pins the match.
- **Recommendation**: None. If a future change adds a way to reach `SKIP`, it needs its own test showing what it proved.

### [LOW] A build-time read of the archive corpus reaches a published page

- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-829
- **File**: `site-src/_data/roster.cjs:159`
- **Impact**: The docs site renders a value computed from `docs/archive/**` at build time. Anything that could write a bundle there could move a number on a published page — but the corpus is committed content and the site builds from a checkout, so that means write access to the repository, a strictly larger capability. The same file already loads `derive-counts.mjs`, `checks/memory.mjs` and `workflows-validator-predicates.js` through the same indirection, so the trust boundary is unchanged in kind. Every rendered value is a number or the `'tdd-quickfix'` literal this file passes in; nunjucks autoescapes by default under Eleventy, verified by probe.
- **Recommendation**: None. Keep `track` a caller-supplied literal. Rendering a bundle-derived string would need the escaping question re-asked.

## Dependencies

No packages added, removed, or version-changed. Both new modules are zero-dependency `.mjs` on Node builtins, which is what `constraints/zero-runtime-dependencies` requires of anything under `.claude/skills/**`.

## Out of scope / Noted

**The guard's skip rests on an assumption about the rest of the suite, and that assumption is now pinned by a test.** Re-running the full suite at every archive is unconditionally correct and costs about five minutes per workflow. This skips that run when nothing the checks read has moved, where "what the checks read" was measured rather than assumed: the per-track fitted envelope, every archived `spec.md` by path and content, and the set of distinct artifact filenames. Two suites resolve the live archive tree — `drift-check-contracts.test.mjs:271` sweeps every archived spec and scores it, and `spec-drift-repair.test.mjs:28` resolves one by walking date directories — and both consume archived specs, which the digest covers.

The residual exposure is a THIRD reader appearing later and depending on something the digest omits, such as the bundle count or bundle paths. `test_when_a_test_reads_the_live_archive_then_it_is_a_declared_reader` fails when any undeclared test file resolves the live archive root, so that reader cannot arrive silently: whoever adds it has to widen `corpus-digest.mjs` or declare what the new file consumes. The tripwire was verified by removing a known reader from the declared set and watching it fail.

