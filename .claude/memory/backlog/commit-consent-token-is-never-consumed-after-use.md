---
key: commit-consent-token-is-never-consumed-after-use
category: backlog
scope: [security, spec, tdd]
status: open
raised-on: 2026-07-25
raised-in-context: slug-guard-hoist-and-consent-expiry (`/security` MEDIUM finding)
source: user-instruction
estimated-effort: medium (touches /commit's contract; power-track interaction needs its own coverage)
verified-at: ea618e9
last-touched: 2026-07-25
caveat: do NOT "fix" this by lowering `consent.workflow_ttl_seconds`. The TTL is a bound on a window that should not exist at all once the landing it authorized has finished; shrinking it narrows the symptom and leaves the cause.
---

> verbatim (user, 2026-07-25, choosing among four options at the `/security` yield):
> "Backlog it, land this now"

- Intent: `.claude/state/commit_consent` is never unlinked after a successful commit (verified: no `unlink`/`rm` of that path in `commit/SKILL.md` or `git_commit_guard.mjs`). Combined with the archive-aware `resolveWorkflow` landed in this workflow — which resolves a workflow slug from `docs/archive/<date>/<slug>/workflow.json`, and archive bundles are permanent — a surviving token keeps matching its own slug indefinitely. Any subsequent, unrelated commit on a protected branch is therefore authorized with no fresh `/grant-commit` for the full `consent.workflow_ttl_seconds` (14400s / 4h).
- This is a WIDENING of a pre-existing hole, not a new one: before the archive resolution landed, the same gap closed after the 900s ad-hoc fallback. OWASP A01, CWE-613. Full analysis: `docs/archive/2026-07-25/slug-guard-hoist-and-consent-expiry/security.md`.
- Fix: consume the token. Unlink `.claude/state/commit_consent` at `/commit`'s FINAL step, after the commit lands. That bounds consent to the landing it was granted for regardless of TTL, and demotes 14400s from load-bearing to a mere backstop.
- The interaction that needs care: the `power` track legitimately produces SEVERAL commits under ONE workflow-scoped grant (`power/commit-split.mjs`, closure last). Consumption must therefore be per-LANDING, not per-commit — which is why this is a spec-level change to `/commit`'s contract rather than a one-line unlink.
- Two LOW findings from the same review, cheap to fold into the same slice: (1) `consent-decision.mjs` `resolveWorkflow` matches an archive bundle by DIRECTORY name but returns the slug read from the bundle's JSON body — fails closed today, but two sources of truth for one identity is a confused-deputy shape; return the matched directory name instead. (2) `slug.mjs` `assertSafeSlug` runs the regex before the O(1) length check while `isSafeSlug` orders it correctly; no ReDoS (the pattern is linear), just inconsistent.
- Related: [[.claude/hooks/lib/consent-decision.mjs]], [[.claude/hooks/lib/slug.mjs]], [[hook-sandbox-fixtures-use-an-explicit-cpsync-allowlist]].
