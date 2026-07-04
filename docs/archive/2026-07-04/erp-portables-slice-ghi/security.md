# Security reports — erp-portables-slice-ghi

## erp-portables-slice-ghi-2026-07-04.md

# Security Review — main (erp-portables-slice-ghi) — 2026-07-04

## Summary

Overall risk: **LOW**. The diff (18 files, +169/−28) adds a pure text-parsing check to the traceability oracle, a strictly execution-reducing glob gate to the two PostToolUse runner hooks, two prose-only skills with one pure helper, and constitution/count edits. No new dependencies, no network calls, no crypto, no auth surface, no secret material. `npm audit --omit=dev`: 0 vulnerabilities.

## Findings

### [LOW] Narrow `file_globs` can silently mute test feedback
- **OWASP**: A05 - Security Misconfiguration | **CWE**: CWE-1188 (insecure default — inverse case)
- **File**: .claude/hooks/test_runner.mjs:53 (and lint_runner.mjs:49)
- **Evidence**:
  ```js
  const fileGlobs = projectGet('.test.file_globs');
  if (Array.isArray(fileGlobs) && fileGlobs.length > 0 && !matchAnyGlob(rel, fileGlobs)) emitAllow();
  ```
- **Impact**: a project owner who declares an over-narrow `test.file_globs` (e.g. `["src/**"]` in a repo whose logic lives elsewhere) silently loses the post-edit test signal for non-matching paths. Not attacker-reachable — `project.json` is repo-owned config, and the skip only *reduces* command execution; the binding verify verdict (full suite) is unaffected.
- **Recommendation**: accept as designed (spec AC-008 mandates silent skip; absent/empty globs stay fail-open). The shipped template default `["**/*"]` matches everything, so a consumer must opt in to narrowing.

## What was checked

- **Injection (A03)**: the runners' `bash -lc` spawn of `lint|test.cmd` is pre-existing and untouched; this diff adds no new string interpolation into any command. `matchAnyGlob` is the existing hand-rolled glob→regex matcher already trusted by `git_commit_guard`; inputs are repo-relative paths and repo-owned config, not attacker-controlled.
- **Oracle (spec-traceability-review/oracle.mjs)**: pure string parsing of spec/intake markdown with anchored regexes; no exec, no fs, no ReDoS-shaped patterns (linear scans, bounded alternations).
- **commit-planner/inventory.mjs**: pure function, validates its input shape (throws TypeError on non-array / non-string paths), no fs/git/exec despite operating on path strings.
- **New skills (SKILL.md ×2)**: prose. commit-planner is read-only by contract and explicitly forbids `git add -A`/consent-path writes; retrospective writes only memory entries. Neither adds an invocation surface beyond the normal Skill registry.
- **Secrets hygiene**: no tokens, keys, or `.env` handling anywhere in the diff.
- **Access control / consent gates (A01)**: no hook wiring changes, no consent-path changes, roster stays 26; `git_commit_guard`, approval guards untouched.
- **Dependencies (A06)**: zero new packages; stdlib only. `npm audit --omit=dev` clean.

## Dependencies

None added or changed.

## Out of scope / Noted

- The runners' pre-existing `bash -lc ${cmd}` execution of repo-owned config is a known, accepted design (config-as-code trust model); flagged here only for continuity with prior reviews.
- Three pre-existing dirty archive paths (`docs/archive/2026-06-23/org-team-charter/workflow.json`, `docs/archive/2026-07-03/erp-portables-slice-c/workflow.json`, `docs/archive/2026-06-22/mvp-sprint-parallel-cycles/`) predate this workflow and are not part of this slice's diff review.

