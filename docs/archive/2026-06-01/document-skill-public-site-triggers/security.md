# Security reports — document-skill-public-site-triggers

## document-skill-public-site-triggers-2026-06-01.md

# Security Review — document-skill-public-site-triggers (Club B) — 2026-06-01

## Summary

Overall risk: **LOW** (no actionable findings). The change adds a read-only, deterministic helper (`public-site-reflect.mjs`) that greps the public-site `.njk` files for governance tokens a diff touches, plus SOP prose in `document/SKILL.md`. No runtime/network/auth surface, no new dependencies, no writes. Reviewed the working-tree diff (1 new helper, 1 SKILL.md edit, 1 new test); full suite 693/693, audit PASS.

## What was checked

- **A03 Injection / ReDoS** — `findDescribedSurfaces` builds `new RegExp(\`\\b${escapeRe(token)}\\b\`)` where `token` is a derived governance name (skill slug / hook / command, charset `[a-z0-9-]` in practice) and `escapeRe` escapes all regex metacharacters before interpolation. No user/network input reaches the pattern; the word-boundary anchors add no catastrophic-backtracking risk. No command execution (`node:fs` only).
- **A03 Path traversal** — paths are built with `join(root, 'site-src')` and the recursive `listNjk` only descends directories under that fixed subtree; `root` is `process.env.CLAUDE_PROJECT_DIR || process.cwd()` (trusted) or the explicit test-supplied root. `changedPaths` are matched by regex to extract a token, never used as a filesystem path. No traversal vector.
- **A08 Integrity** — the helper performs only reads (verified by an AC-005 test snapshotting the fixture tree before/after). It surfaces pages; it does not edit `site-src/**` (D3 surface-only). No data mutation.
- **Availability / false-trigger** — word-boundary matching prevents a short token (e.g. `document`) from matching inside a longer identifier (`documentation`), bounding over-surfacing. An over-surface would at most prompt a redundant human-reviewed doc pass — no security impact.
- **Secrets** — none introduced; the helper reads only public site templates and skill/hook names.

## Dependencies

None added. `npm audit` clean (unchanged).

## Out of scope / Noted

- The reflective check is a deterministic name-grep, not semantic — by design (non-goal). A page that describes a behavior without naming the changed skill/hook/command token is not surfaced; that is an accuracy limit, not a security issue, and the file-presence survey still catches `site-src/**` files that ARE in the diff.
- `root` trust mirrors the existing `audit`/deriver assumption; if the helper were ever run against an untrusted tree the trust boundary should be revisited — out of scope.

