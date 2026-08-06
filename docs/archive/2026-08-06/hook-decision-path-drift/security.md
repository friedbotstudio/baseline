# Security reports — hook-decision-path-drift

## hook-decision-path-drift-2026-08-06.md

# Security Review — main (hook-decision-path-drift) — 2026-08-06

## Summary

Overall risk: **LOW**, with no findings. The change is 13 insertions / 6 deletions across five tracked files plus three new untracked ones, and it is almost entirely governance prose. The only executable addition is `.claude/skills/audit-baseline/checks/hook-decision-paths.mjs` (38 substantive lines), a pure read-only function over the audit's existing `ctx` that performs two `indexOf` calls and one regex scan over repo-local files. No new dependency, no network call, no subprocess, no filesystem write, no user-supplied input at any boundary.

## What was checked

- `git diff` plus the three untracked files, read in full: the new check module, the new test, and the new landmine entry.
- Path construction in the new module: `ctx.readText(\`.claude/hooks/${file}\`)` where `file` comes from `ctx.listDir('.claude/hooks')` — a directory listing, not caller input. No traversal surface (contrast the two CWE-22 notes in the previous landing, where a caller-supplied `label` reached a path).
- The one regex added, `/\bPath ([A-Z])\b/g`, for catastrophic backtracking: single character class, bounded, no nesting, no alternation. Linear.
- `annexBullet`'s slicing arithmetic for an out-of-bounds or negative-index read: `indexOf` returning `-1` is handled explicitly on both the marker and the terminator.
- Whether the new audit check can change the audit's exit code in a way that weakens a gate — it can only ADD `FAIL` rows, never suppress one.
- Secrets hygiene across the diff: no tokens, keys, credentials, or `.env` reads introduced.
- Governance-prose edits for accidental weakening of a security-relevant rule (see Out of scope below).
- `npm audit --omit=dev` → **0 vulnerabilities**. No package added or changed.
- `semgrep` / `bandit` / `gosec` are not installed in this environment; per the skill's constraint none was installed.

## Findings

None.

## Dependencies

No package added, removed, or version-changed. `npm audit --omit=dev`: 0 vulnerabilities.

## Out of scope / Noted

- **The prose edits do not relax any enforcement.** This landing rewrites the description of `harness_continuation` in `CLAUDE.md` Article VIII, Article V's safety-net bullet, `.claude/CONSTITUTION.md`, and `harness/SKILL.md`. Every edit is descriptive: no consent gate is removed, no TTL changed, no guard weakened, and `harness_continuation.mjs` itself is untouched. The new text makes Path B *explicit*, which narrows the space for an operator to mistake a satisfied gate for a bypassed one — the failure the RCA records. Worth stating plainly because "documentation-only" edits to a constitution are exactly where a quiet loosening would hide.
- **The check reads the annex, so the annex becomes a weak integrity surface.** A contributor could satisfy `hook-decision-paths` by pasting `Path A Path B` anywhere in a hook's annex bullet without describing them. This is a documentation-accuracy oracle, not a tamper-evidence mechanism, and it is not defending against a motivated insider — the manifest hash-drift check (Article XII) is what covers deliberate modification of shipped baseline files. Noted so nobody later mistakes this check for an integrity control.
- **Coverage is 1 of 26 hooks and the check says so on every run.** A future refactor that renames the `Path <X>` convention would silently drop coverage to zero. The coverage row is the only thing that would make that visible; it should not be removed to tidy the audit output.
- **Prior open item, unchanged by this diff**: `commit-consent-token-is-never-consumed-after-use` (OWASP A01 / CWE-613) remains open in the backlog. Untouched here, and not a regression of this landing.

