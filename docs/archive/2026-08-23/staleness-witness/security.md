# Security reports — staleness-witness

## staleness-witness-2026-08-23.md

# Security Review — main (staleness-witness) — 2026-08-23

## Summary

Overall risk: **HIGH at review, both findings fixed in-cycle 2026-08-24.** The diff replaces the commit-distance leg of the memory staleness
predicate with a witness over each entry's `governs:` paths. Two findings, both reachable
from memory-entry frontmatter and both demonstrated live in this repository. The first is a
pre-existing argument-injection exposure that this change makes SILENT rather than loud; the
second is a new availability defect introduced by the witness leg.

## What was checked

- `git diff HEAD` plus the two new untracked files: 4 files, ~110 net lines.
- Trust boundaries in the diff: two, both fed by memory-entry frontmatter, which is
  repository-controlled and reaches these readers without validation:
  1. `verified-at` interpolated into a `git` argv (both callers).
  2. `governs:` passed as a glob list to `matchesAnyGlob`.
- Injection (A03): `spawnSync` is called with an argv array and no shell, so there is no
  command injection. Argument injection is a separate matter and is finding 1.
- Secrets: no literal, no env read, no `.env` path in the diff.
- Cryptography, authN/authZ, SSRF: not present in this surface.
- Dependencies: none added. `package.json` and the lockfile are untouched.
- Linters: this project configures no security linter (`project.json → lint.cmd` is null).

## Findings

### [HIGH] A hostile `verified-at` value reaches git as an option, giving arbitrary file write

- **OWASP**: A03 — Injection | **CWE**: CWE-88 (Argument Injection)
- **File**: `.claude/skills/memory-sync/sweep.mjs:221-227`, `.claude/hooks/lib/memory_session_start.mjs:141-148`
- **Evidence**:
  ```js
  function changedSince(root, stamp) {
    const r = spawnSync('git', ['-C', root, 'diff', '--name-only', `${stamp}..HEAD`], ...);
    if (r.status !== 0) return null;
    return r.stdout.split('\n').filter(Boolean);
  }
  ```
  `stamp` is `readFieldValue(block, 'verified-at')`, taken verbatim from entry frontmatter.
  A value beginning with `-` is parsed by git as an option, not as a revision. Measured in
  this repository on 2026-08-23:
  ```
  verified-at: --output=<path>
    -> git diff --name-only --output=<path>..HEAD
    -> status 0, and <path>..HEAD created on disk (118 bytes of diff output)
  ```
- **Impact**: an entry whose `verified-at` is `--output=<path>` causes an arbitrary file
  write at a path the entry chooses, with diff text as content, every time the staleness
  predicate evaluates that entry. Session start evaluates every entry in the store.
- **Pre-existing, and made worse here.** The prior `git rev-list --count ${stamp}..HEAD`
  accepted `--output=` too and created the file. The difference is the exit status:
  `rev-list` then failed at 129 and the caller reported a null distance, so the anomaly was
  at least loud. `git diff` accepts the option and exits **0**, so the same attack now
  succeeds silently and the predicate reports a normal verdict. This diff did not open the
  hole; it removed the noise that would have led someone to it.
- **Resolved**: 2026-08-24, same workflow. `usableStamp` in `.claude/hooks/lib/staleness.mjs`
  accepts `/^[0-9a-f]{7,40}$/` and nothing else; both callers gate the git call on it and
  treat a rejected stamp exactly as an unresolvable one. Re-ran the exploit against
  `sweep.isStale`: no file created, verdict falls through to the date leg.
- **Recommendation**: validate the stamp before it reaches argv. It is a git short SHA and
  nothing else, so reject anything that is not `/^[0-9a-f]{7,40}$/` and treat a rejected
  stamp exactly as an unresolvable one — return null and fall through to the date leg. A
  `--` terminator does not help here, because the injected text is the revision argument
  itself rather than a pathspec.

### [MEDIUM] A crafted `governs:` glob throws out of the predicate and can abort session start

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-248 (Uncaught Exception)
- **File**: `.claude/hooks/lib/staleness.mjs:38-42`, reached from `memory_session_start.mjs:209,338`
- **Evidence**:
  ```js
  export function governsMatches(governs, changedPaths) {
    return changedPaths.some((p) => typeof p === 'string' && matchesAnyGlob(p, governs));
  }
  ```
  `glob-match.mjs` deliberately propagates a `RangeError` for a glob it refuses to compile,
  rather than reading it as "no match". Measured 2026-08-23: a `governs:` value of 80
  repeated `**/` segments throws `RangeError: glob-match: refusing "**/**/..."` straight out
  of `isStaleFromFields`. Neither call site in the session-start hook wraps it.
- **Impact**: availability only. No disclosure and no write. One malformed entry aborts the
  staleness pass and, with it, the SessionStart index the operator reads to orient.
- **Resolved**: 2026-08-24, same workflow. The witness now reports three states — moved,
  did not move, could not tell — and "could not tell" falls through to the date leg. The
  first attempt (catch the RangeError, return "no match") was wrong and the test caught it:
  it reports an entry fresh at any age on the strength of a comparison that never ran.
  `glob-match.mjs` is untouched, so its refusal still propagates for every other caller.
- **Recommendation**: catch the refusal at the predicate boundary and treat an
  uncompilable glob as no match, then fall through to the date leg. The surrounding memory
  surfaces already declare themselves "advisory and fail-open throughout"
  (`governed-memory.mjs:15-17`); this path should match that contract. Do not silence the
  RangeError inside `glob-match.mjs` — its propagation is deliberate and other callers
  depend on it.

## Resolution (2026-08-24, same workflow)

Both findings were fixed before this change landed, driven by two new scenarios in
`tests/memory-staleness-witness.test.mjs`.

- **Finding 1.** `usableStamp` in `.claude/hooks/lib/staleness.mjs` accepts `/^[0-9a-f]{7,40}$/`
  and nothing else; both callers gate the git call on it and treat a rejected stamp exactly
  as an unresolvable one. Re-ran the exploit against `sweep.isStale` with
  `verified-at: --output=<path>`: no file created, verdict falls through to the date leg.
- **Finding 2.** The first attempt — catch the RangeError and return "no match" — was wrong,
  and the test caught it: it reports an entry fresh at any age on the strength of a
  comparison that never ran. The witness now returns three states (moved / did not move /
  could not tell) and "could not tell" falls through to the date leg. `glob-match.mjs` is
  untouched, so its refusal still propagates for every other caller.
- Live measure after both fixes: 63 stale of 426, unchanged from before them.

## Dependencies

No new packages. Nothing to check against an advisory database.

## Out of scope / Noted

- Both findings are reachable only by writing entry frontmatter under `.claude/memory/`.
  In this repository that is a reviewed, committed surface, which is what keeps the first
  finding at HIGH rather than CRITICAL. It is worth noting that `/memory-sync` promotes
  entries from auto-extracted candidates, so the distance between conversation text and a
  frontmatter value is shorter than it looks.
- The same unvalidated `verified-at` reaches `git` in any other reader that interpolates it.
  This review covers the two in the diff.

