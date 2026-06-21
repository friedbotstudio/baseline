# Security reports — rightsize-triage-drift-skip

## rightsize-triage-drift-skip-2026-06-21.md

# Security Review — rightsize-triage-drift-skip — 2026-06-21

## Summary

Overall risk: **LOW**. The diff adds two mechanical Node helpers (stdlib-only) that read the local git tree + trusted `project.json`/`workflow.json` config, plus a constitutional amendment and a config block. No network, auth, DB, secrets, or untrusted external input. The two fail-direction designs (gate fail-open, drift-guard fail-safe) both fail toward *more* verification, never less. No CRITICAL/HIGH findings.

## Findings

### [LOW] git invoked without a shell; option-injection guarded — verified safe
- **OWASP**: A03 Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `.claude/skills/harness/rightsize-gate.mjs:135,154`
- **Evidence**:
  ```
  d = exec('git', ['-C', rootDir, 'diff', '--no-index', '--numstat', '--', '/dev/null', rel]);
  // default exec: execFileSync(cmd, args, {encoding:'utf8', maxBuffer:...})
  ```
- **Impact**: `rel` is an untracked path from `git ls-files --others`. If it could reach a shell or be read as an option, a crafted filename could inject. It cannot: `execFileSync` spawns `git` directly (no shell, so no metacharacter expansion), and the `--` separator precedes the pathspec so a `-`-leading filename is treated as a path, not a flag. `git ls-files` only emits in-repo paths.
- **Recommendation**: None required. Pattern is correct; keep the `--` separator and the array-arg `execFileSync` form (do not switch to `exec`/shell string).

### [LOW] hand-rolled glob→RegExp on trusted config — ReDoS not reachable
- **OWASP**: A04 Insecure Design | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **File**: `.claude/skills/harness/rightsize-gate.mjs:30-49`
- **Evidence**:
  ```
  if (g[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
  else { out += '.*'; i++; }
  ```
- **Impact**: `globToRegex` compiles `doc_globs`/`sensitive_globs` into regexes containing `.*`/`(?:.*/)?`. Pathological patterns could in principle backtrack, but the glob source is `project.json` (maintainer-authored, trusted) and the match target is a bounded repo path. No attacker-controlled pattern reaches this code.
- **Recommendation**: None required while patterns are trusted config. If a future feature ever sources globs from untrusted input, anchor/segment-limit the compiled regex then.

### [LOW] fingerprint reads bounded to in-repo untracked files
- **OWASP**: A01 Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/tdd/drift-reverify-guard.mjs` (reuses `simplify/reverify-guard.mjs:collectTreeState`)
- **Evidence**:
  ```
  .map((rel) => ({ path: rel, sha256: hashContent(readFile(path.join(rootDir, rel))) }))
  ```
- **Impact**: Paths come from `git ls-files --others --exclude-standard`, which only lists files inside the work tree; content is hashed, never executed or emitted. No traversal outside the repo.
- **Recommendation**: None required.

## Positive design notes (defense-in-depth, in scope)

- **A04 / fail-safe direction (good).** `rightsize-gate.mjs` is fail-open: any error / `velocity.rightsize.enabled:false` → `skip:[]` (every phase runs). `drift-reverify-guard.mjs` is fail-safe: any doubt → exit 0 (re-verify). Both failure modes add verification, never remove it.
- **A08 integrity (good).** The gate's skip allowlist is a hard subset of `{simplify, document}` — it can never skip `security`, `integrate`, or the consent gates. Skipping `simplify`/`document` bypasses no security control. The `sensitive_surface_unreviewed` advisory backstops the case where a human skips `security` over a sensitive surface.

## Dependencies

None added — both helpers are Node stdlib only (`node:crypto`, `node:child_process`, `node:fs`, `node:path`, `node:url`). No `npm audit` surface change.

## Out of scope / Noted

- The Article IV amendment widens the sanctioned skip surface from one mechanism (`/triage` exceptions) to two. This is governance-by-design, reviewed and approved at gate A; the mechanical bounds (allowlist subset, additive-only, never-`security`, fail-open) are the security-relevant controls and are unit-tested (AC-006, AC-002, AC-005).

