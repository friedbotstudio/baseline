---
key: .claude/skills/workspace/annotations.mjs:1
category: landmarks
scope: []
governs: .claude/skills/workspace/annotations.mjs, .claude/skills/scout/SKILL.md, docs/annotations.md
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/workspace/annotations.mjs`. Domain — annotation discovery, the CONSUMER-side half of tracking comments (Epic 7 slice F, spec ACs 001/002/009).
- Role: `scanAnnotations({rootDir, memDir, files?})` walks tracked files, resolves every `@<verb>:<key>` it finds via `refs.resolveAnnotation`, and returns `{scanned, resolved[], dangling[]}`. `scout/SKILL.md` step 0.5 is the caller; `code-structure` owns the placement side.
- **It exists because `refs.mjs` shipped with no caller.** The ef cycle's AC-008/AC-009 passed against the resolver while `scout/SKILL.md` never mentioned annotations, so the feature was green and inert. See [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]].
- Scope rules are policy, deliberately in code rather than SKILL.md prose: excludes `docs/**`, excludes `project.json → tdd.test_globs`, and skips keys containing `<`/`>`. Each exclusion was added because a real file tripped it — the syntax table in `docs/annotations.md`, a `@decision:<key>` placeholder in an archived spec, and a deliberately-dangling fixture key.
- Repo-wide scan measured 110 ms over 2110 tracked files, which is why it does NOT scope to the touched slice: scoping saves nothing and would leave a dangling annotation in an untouched file silent forever.
- Fail-open throughout. No git work tree, unreadable file, or malformed `project.json` each degrade to scanning less, never to throwing. Always exits 0 — a dangling annotation is a scout-report finding, never a failed phase.
- `files?` exists so fixtures can drive it (a `mkdtemp` root is not a git repo). Security review recorded it as LOW CWE-22: the parameter is not contained to `rootDir`, and `git ls-files` output cannot escape, so no untrusted caller reaches it. Report: `docs/archive/2026-08-04/tracking-annotations/security.md`.
- Companions: `.claude/skills/workspace/refs.mjs` (the resolver + the verb map), `.claude/skills/workspace/placement.mjs` (the write side), `docs/annotations.md` (the format reference).

- rests_on: zero-runtime-dependencies
