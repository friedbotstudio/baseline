# Security reports — tracking-annotations

## tracking-annotations-2026-08-04.md

# Security Review — main (tracking-annotations) — 2026-08-04

## Summary

Overall risk: **LOW**. Two LOW findings, both in the new scanner's path handling and neither reachable by an untrusted caller today. The three prior classes carried into this cycle — F-1 traversal, F-2 forged frontmatter, F-3 ReDoS — were each re-probed against the widened code and all three remain closed. No new dependency, no secret, no crypto, no network surface.

The review was risk-driven as well as glob-triggered: `.claude/hooks/lib/memory_session_start.mjs` is under `security.sensitive_globs`, but its change is a single comment line. The real new surface is `annotations.mjs`, which reads arbitrary tracked files and shells out to `git`.

## Findings

### [LOW] `scanAnnotations` does not contain the caller-supplied `files[]` to `rootDir`

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/workspace/annotations.mjs:50` (`readable`), reached from `scanAnnotations:78`
- **Evidence**:
  ```js
  function readable(rootDir, rel) {
    try {
      return readFileSync(join(rootDir, rel), 'utf8');
    } catch {
      return null;
    }
  }
  ```
- **Impact**: a caller passing `files: ['../etc/passwd']` reads outside `rootDir`. Proven by probe — `scanAnnotations({rootDir:'/tmp', files:['../etc/passwd','../../etc/hosts']})` returned `scanned: 2`, so both reads succeeded. Disclosure is bounded: only annotation *tokens* are extracted, so content leaks solely as "this path contains `@decision:<key>`" via a `dangling[]` row. No untrusted caller exists — `scout` passes no `files`, and the production path enumerates via `git ls-files`, which is always repo-relative and cannot escape. The parameter exists for fixtures.
- **Recommendation**: reject rather than normalize, matching the register `assertSafeFactKey` already sets in this subsystem. In `scanAnnotations`, drop any `rel` where `resolve(rootDir, rel)` does not start with `resolve(rootDir) + sep`. One predicate, no behavior change for `git ls-files` input. Do **not** silently rewrite the path — that would mask the caller bug.

### [LOW] The scan follows symlinks out of the repository

- **OWASP**: A01 Broken Access Control | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/workspace/annotations.mjs:50`
- **Evidence**: probe — a repo-internal `link.mjs` symlinked to a file in `$TMPDIR` was scanned and its annotation resolved, reporting `{"file":"link.mjs","line":1,"verb":"decision","key":"k"}`.
- **Impact**: `git ls-files` does list symlinks, so this is reachable on the production path, unlike the finding above. A committed symlink pointing outside the tree causes the scanner to read the target. Disclosure is the same bounded shape — annotation tokens only, never file contents. Committing such a symlink already requires write access to the repository, at which point an attacker has better options.
- **Recommendation**: accept, or gate on `lstatSync(p).isFile()` before reading if the containment fix above is applied anyway (the two share a call site). Flagging for the record rather than recommending action.

## Prior classes re-probed

| Class | Origin | Verdict | Evidence |
|---|---|---|---|
| F-1 traversal (CWE-22) | living-system-model-ef | **CLOSED** | A shard named `innocent.md` declaring `key: ../../victim/target` with `load_bearing: true` was planted. The widened read gate returns `true` but builds no path. The write path threw `unsafe fact key/filename slug (REJECT, never normalize)` and the victim file was byte-intact. `assertSafeFactKey` still runs before `findEntry` and before any `join`. |
| F-2 forged frontmatter | living-system-model-ef | **CLOSED** | After `proposeLoadBearing` on an entry whose *body* contains the literal text `load_bearing: true`, the frontmatter carries exactly **one** marker, the body is preserved verbatim, and the entry stayed in `landmines/`. `stampMarker` remains bounded to the frontmatter block via `splitFrontmatter`; the only interpolated value is the literal `true`. |
| F-3 ReDoS | living-system-model-ef | **NOT REACHABLE** | The verb pattern widened from a fixed alternation to `[a-z-]+`, which is linear with no nested quantifier. Adversarial input of 150 002 chars matched in 0.24 ms; a 100 000-char no-colon string that forces full backtracking took 0.47 ms. `matchesGlob`'s existing `MAX_WILDCARDS = 12` cap still bounds the glob side. |

## Other checks performed

- **Command injection** — `execFileSync('git', ['-C', rootDir, 'ls-files'])` passes an argument array with no shell, so `rootDir` metacharacters cannot reach a command line. Clean.
- **Widened write target** — `proposeLoadBearing` builds `join(memDir, found.category, key + '.md')` where `found.category` comes from the frozen `CANONICAL` literal, never from caller input, and `key` is `assertSafeFactKey`-validated. No new injection point.
- **Fail-open surfaces** — `trackedFiles`, `excludedGlobs` and `readable` each swallow errors and degrade to empty. None swallows a *security* decision; they degrade availability of the report only, and the report is advisory (always exits 0).
- **Secrets hygiene** — diff scanned for keys, tokens, private-key headers, and provider prefixes. None.
- **Dependencies** — no package added. `dependencies` is unchanged at `@clack/prompts@1.4.0`. The new module is Node stdlib only, so the `zero-runtime-dependencies` constraint holds for runtime code.
- **Trust boundary** — this subsystem has no network, no HTTP handler, no auth, no crypto, and no untrusted external input. Its inputs are the repository's own files and its own memory store.

## Dependencies

No new packages in this diff. No CVE check required.

## Out of scope / Noted

- `scanAnnotations` surfaces a memory entry's `hook` line into scout's report. An actor able to write `.claude/memory/` could plant instruction-shaped prose that reaches a reader. This is **not new** — `memory_session_start` already injects memory into session context — and such an actor has strictly better options. Noted, not a finding.
- A very large tracked file is read whole into memory by `readFileSync`. At this repository's scale (888 files scanned) it is immaterial; a repo with a multi-GB tracked blob would feel it. Availability only, and the caller is a developer tool.
- The `detectConflicts` sibling-op defect carried from `6fc019d` remains open and is explicitly out of this cycle's scope. It is a correctness defect, not a security one.

