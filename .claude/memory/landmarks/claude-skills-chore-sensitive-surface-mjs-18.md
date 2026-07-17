---
key: .claude/skills/chore/sensitive-surface.mjs:18
category: landmarks
scope: [scout]
---

- Role: Domain — the predicate answering "does this chore's diff touch a security-sensitive surface?", so a chore touching `.claude/hooks/**` can no longer ship with no security review. `touchesSensitiveSurface(changedPaths, sensitiveGlobs)` glob-matches the diff against `project.json → security.sensitive_globs`; `changedPathsFromGit()` collects them. The `rightsize-gate` was built to NEVER skip security, but the chore track had no security node and no trigger, so it violated that principle BY CONSTRUCTION — this closes the gap.
- Companion: `.claude/skills/chore/SKILL.md` (routes to `/security` on a true verdict), `.claude/project.json → security.sensitive_globs`, `.claude/hooks/lib/common.mjs → matchAnyGlob`, `tests/chore-sensitive-security.test.mjs`.
- Verified-at: 0aa70cf
- Last-touched: 2026-07-13
- Caveat: NEVER parse human-readable porcelain here (D15c). `git status --porcelain` + `line.slice(3)` yields `"docs/a.md -> .claude/hooks/injected.mjs"` as ONE string for a rename and keeps git's literal quotes around paths with spaces or non-ASCII — neither matches a glob, so a chore that ADDS A HOOK via a routine `git mv` reported not-sensitive and skipped security review entirely, defeating the exact gap this helper exists to close. It uses NUL-separated `git diff --name-only -z HEAD` + `git ls-files -o -z` instead (no quoting, and `--name-only` gives the NEW path). Advisory by contract: fails safe to `false` and the CLI always exits 0 — a helper that can block a commit is one that will eventually block the wrong one. The two git probes are guarded independently so a repo with no commits (no HEAD) still reports its untracked files.
