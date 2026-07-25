# Security reports — slug-guard-hoist-and-consent-expiry

## slug-guard-hoist-and-consent-expiry-2026-07-25.md

# Security Review — slug-guard-hoist-and-consent-expiry — 2026-07-25

## Summary

Overall risk: **MEDIUM**. The CWE-22 hardening half of this diff is sound — every slug-derived path
is now validated before composition, and the traversal that `timing.mjs` previously allowed is closed.
The consent half introduces one finding worth acting on: the workflow-scoped TTL rises from 900s to
14400s, and because the `commit_consent` token is never consumed and archive bundles are permanent,
a single `/grant-commit` now authorizes unrelated commits for up to four hours rather than fifteen
minutes. That is a 16× widening of a gate-C bypass window. No CRITICAL or HIGH findings.

## Findings

### [MEDIUM] Workflow-scoped consent token is not consumed, widening the gate-C window to 4h

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-613 (Insufficient Session Expiration)
- **File**: `.claude/hooks/lib/consent-decision.mjs:44-46,75`, `.claude/hooks/git_commit_guard.mjs:216-222`
- **Evidence**:
  ```js
  const slugTtl = Number.isFinite(workflowTtl) ? workflowTtl : ttl;
  ...
  if (age > slugTtl) return { allow: false, mode: 'slug', reason: `consent expired (...)` };
  return { allow: true, mode: 'slug', reason: `workflow-scoped consent for '${live}' (${age}s old)` };
  ```
  ```js
  let workflowTtl = projectGet('.consent.workflow_ttl_seconds');
  if (typeof workflowTtl !== 'number' || !Number.isFinite(workflowTtl)) workflowTtl = 14400;
  ```
- **Impact**: `.claude/state/commit_consent` is never unlinked after a successful commit (verified: no
  `unlink`/`rm` of that path in `commit/SKILL.md` or `git_commit_guard.mjs`), and `docs/archive/<date>/<slug>/`
  bundles are permanent. So once workflow X has landed, `resolveWorkflow` keeps resolving X from its
  archived bundle indefinitely, and the surviving token keeps matching. Any *subsequent, unrelated*
  commit on a protected branch is therefore authorized without a fresh `/grant-commit` for the full
  4-hour TTL. Before this change the same gap existed but closed after 900s. This is a widening of an
  existing hole, not a new one, and it requires repo write access — but gate C is the last human
  checkpoint before code lands, so the window matters.
- **Recommendation**: Consume the token. Unlink `.claude/state/commit_consent` in `/commit` after the
  commit succeeds — this bounds consent to the landing it was granted for regardless of TTL, and makes
  the 14400s value safe rather than load-bearing. If consumption is undesirable (a `power`-track batch
  legitimately commits several times under one grant), consume it at `/commit`'s final step instead, or
  record the granting workflow's `created_at` in the token and refuse once that workflow's bundle is
  archived *and* a later workflow has started.

### [LOW] Archive resolution matches on directory name but returns the bundle's self-declared slug

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-345 (Insufficient Verification of Data Authenticity)
- **File**: `.claude/hooks/lib/consent-decision.mjs:105-112`
- **Evidence**:
  ```js
  const archived = findArchivedWorkflow(rootDir, tokenSlug);   // matched by DIRECTORY name
  if (archived) {
    const slug = canonicalSlug(JSON.parse(readFileSync(archived, 'utf8')).slug || '');
    if (slug) return { present: true, slug, readable: true, source: 'archive' };  // returns CONTENT slug
  }
  ```
- **Impact**: The lookup selects a bundle by directory name (`tokenSlug`) but reports the slug read from
  that bundle's JSON body. If the two disagree — a hand-edited or mis-archived bundle — `decideCommitConsent`
  compares `token.slug !== live` and **denies**. So this fails closed and is not an escalation path; the
  consequence is a confusing denial of a legitimate grant. Flagged because two sources of truth for one
  identity is the shape that later becomes a confused-deputy bug if the comparison is ever relaxed.
- **Recommendation**: Return the matched directory name, which is what the search actually authenticated:
  `return { present: true, slug: tokenSlug, readable: true, source: 'archive' }`. Or assert the bundle's
  declared slug equals the directory name and treat a mismatch as fail-closed with a named reason.

### [LOW] `assertSafeSlug` runs the regex before the cheap length check

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity — defensive)
- **File**: `.claude/hooks/lib/slug.mjs:35-47`
- **Evidence**:
  ```js
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) { throw ... }
  if (slug.length > MAX_SLUG_LEN) { throw ... }
  ```
- **Impact**: Speculative and low. `/^[a-z0-9][a-z0-9-]*$/` has no nested quantifiers or alternation, so
  it is linear and **not** ReDoS-able; a multi-megabyte input costs a linear scan before the O(1) length
  check rejects it. Wasted work, not a denial of service. Note `isSafeSlug` already orders these correctly
  (length first), so the two entry points differ.
- **Recommendation**: Move the length check above the regex test in `assertSafeSlug` to match `isSafeSlug`.

## Dependencies

No new packages. `git diff HEAD -- package.json` is empty; the diff uses only Node built-ins
(`node:fs` `readdirSync`/`existsSync`, `node:path` `join`). `npm audit --omit=dev` reports
**0 vulnerabilities**. The zero-runtime-dep posture is preserved.

## What was checked and found clean

- **CWE-22 across every re-pointed call site.** `plan-store`, `consolidate-open-questions`,
  `ac-conformance`, `seed-tasklist`, `fragment-writer`, and both `timing.mjs` builders validate before
  composing a path. The `timing.mjs` traversal is genuinely closed — regression-tested by
  `tests/timing-slug-guard.test.mjs`, which asserts no file lands outside `.claude/state/timing/`.
- **`findArchivedWorkflow` directory-name injection.** `date.name` comes from `readdirSync`, which never
  yields `.`, `..`, or a name containing a path separator. Not attacker-influenceable without filesystem
  write access, which already exceeds what the traversal would grant.
- **Slug validated before the archive scan.** `isSafeSlug(slug)` gates entry to `findArchivedWorkflow`,
  so a hostile `tokenSlug` never reaches `join`. Covered by
  `test_when_token_slug_is_hostile_then_archive_lookup_refuses_to_build_a_path`.
- **Ad-hoc time window unchanged.** The 900s bound on the no-workflow branch is untouched and
  regression-tested (`test_when_adhoc_token_past_time_window_then_denied_at_900`), including an explicit
  assertion that the longer workflow TTL does not rescue an ad-hoc token.
- **Fail-closed paths preserved.** Unreadable `workflow.json` → `readable:false` → deny. Unparseable
  archive bundle → falls through to the ad-hoc window rather than granting. Slug mismatch → deny.
- **Secrets hygiene.** No hardcoded credentials, tokens, or keys in the diff. No `.env` access added.
- **REJECT-never-normalize invariant.** Enforced mechanically by `tests/slug-guard-hoist.test.mjs`, which
  scans all seven modules for any reference to the normalizer.

## Out of scope / Noted

- **Crashed hook reads as ALLOW.** Surfaced during `/tdd`: the sandbox fixtures in
  `tests/branch-aware-git-policy.test.mjs` and `tests/git-topology-guard.test.mjs` copy an explicit
  allowlist of hook lib files, and when `consent-decision.mjs` gained the `slug.mjs` import the spawned
  guard died `ERR_MODULE_NOT_FOUND` — with the empty stdout interpreted as **allow**, flipping 21 deny
  assertions to vacuously green. The fixtures were fixed in this diff, but the underlying property is not:
  a `git_commit_guard` that crashes at runtime fails **open**. That is a design question larger than this
  workflow (it argues for a fail-closed wrapper or a supervisor default-deny) and belongs in its own spec.
  Not counted as a finding here because it is pre-existing and not introduced by this diff.
- **`consent.workflow_ttl_seconds` is a policy dial, not a control.** Once the MEDIUM above is addressed by
  consuming the token, the TTL stops being the primary bound and 14400s carries much less weight.

