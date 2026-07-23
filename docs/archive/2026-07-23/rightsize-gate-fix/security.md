# Security reports — rightsize-gate-fix

## rightsize-gate-fix-2026-07-23.md

# Security Review — rightsize-gate-fix — 2026-07-23

## Summary

Overall risk: **LOW**. The change extends a local, read-mostly dev tool (`.claude/skills/harness/rightsize-gate.mjs`) that reads local repo files (`git` output, `project.json`, `workflow.json`) and writes one additive field to `workflow.json`. No network, no untrusted external input, no secrets, no crypto, no auth surface, no new dependencies. No Critical/High findings. One LOW consistency observation and one LOW hardening note, both non-blocking.

## Scope reviewed

`git diff` for the pending branch — one implementation file changed (`rightsize-gate.mjs`, +93/−6); `SKILL.md` (docs) and `tests/rightsize-gate.test.mjs` (tests) carry no runtime trust boundary. Enumerated data flows: the `--slug` CLI argument, the `execFileSync` git invocations, `readFileSync`/`JSON.parse` of `project.json` + `workflow.json`, and the `writeFileSync` to `workflow.json`.

## Findings

### [LOW] `--slug` is accepted but never validated — safe today, a trap if a future change builds a slug path
- **OWASP**: A04 Insecure Design | **CWE**: CWE-22 (Path Traversal) — *latent, not present*
- **File**: `.claude/skills/harness/rightsize-gate.mjs:186` (`main`), `:213`–`:247` (path builders)
- **Evidence**:
  ```js
  const [sub] = argv;                       // only argv[0] is read
  // ...
  function workflowPath(rootDir) {
    return path.join(rootDir, '.claude', 'state', 'workflow.json');   // rootDir only
  }
  readFileSync(path.join(rootDir, '.claude', 'project.json'), 'utf8'); // rootDir only
  ```
- **Impact**: None today. Every filesystem path is derived from `rootDir` (process.cwd or an injected test root) and fixed literals; the `--slug` token the harness passes is not consumed for pathing, so no attacker-influenced value reaches `path.join`. There is therefore no traversal.
- **Recommendation**: No change required now. **Consistency guard for the future**: sibling harness helpers that *do* build slug-derived paths — `plan-store.mjs` (`assertSafeSlug` inside `planPath`), `checker-fanout.mjs` (`runCheckerFanout` entry) — REJECT a slug not matching `^[a-z0-9][a-z0-9-]*$` before constructing a path. If a later change makes this gate write `.claude/state/rightsize/<slug>.json` (or otherwise route the slug into a path), it MUST call the same `assertSafeSlug` (REJECT, never normalize — see `[[slug-path-guards-must-reject-not-normalize-and-three-regex-traps]]`). Recorded so the next editor does not miss it.

### [LOW] `JSON.parse` of on-disk config into an object spread — negligible prototype-pollution surface on a trusted local file
- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-1321 (Prototype Pollution) — *negligible*
- **File**: `.claude/skills/harness/rightsize-gate.mjs:222`, `:232`, `:122` (`applyBaseline` spread)
- **Evidence**:
  ```js
  return JSON.parse(readFileSync(workflowPath(rootDir), 'utf8'));   // -> workflow
  // applyBaseline:
  return { ...workflow, rightsize_base: paths };                    // shallow spread
  ```
- **Impact**: `JSON.parse` assigns a `"__proto__"` key as an own (non-prototype) property, and the shallow spread copies own enumerable keys — it does not mutate `Object.prototype`. `workflow.json`/`project.json` are developer/Claude-authored in-repo files, not attacker input, so this is defense-in-depth only.
- **Recommendation**: No change required. If ever hardening, `readFileSync` + a reviver rejecting `__proto__` would close it; not warranted for a local trusted file.

## Dependencies

None added. The module is Node.js stdlib-only (`node:child_process`, `node:fs`, `node:path`, `node:url`). No CVE surface introduced.

## Positive controls verified

- **A03 Injection** — `execFileSync(cmd, args, …)` with fixed argv arrays (`git status --porcelain`, `git diff HEAD --numstat`, `git ls-files`, `git diff --no-index`); no shell, no string concatenation. `rootDir` and the git-emitted `rel` are passed as argv elements, not shell tokens. Clean.
- **Fail-safe I/O** — every disk read (`readProject`, `readWorkflow`) and the `runBaseline` write are wrapped in `try/catch`; on any error the gate returns `{}`/exit 0 (fail-open), so a malformed or missing file cannot crash the harness.
- **Integrity of state write** — `runBaseline` writes `workflow.json` only when `rightsize_base` is absent (idempotent, resume-safe via `applyBaseline`), to a fixed `rootDir` path; it never touches a consent artifact.

## Out of scope / Noted

- The `check` path now reads `.claude/project.json` from disk (previously it silently used defaults). This is a correctness fix, not a risk — it reads a trusted in-repo config with a try/catch fallback.
- Pre-existing unrelated unit failure `tests/memory-readers-sharded.test.mjs` (hardcodes 16 backlog shards vs 14 on disk) is not in this diff and carries no security weight.

