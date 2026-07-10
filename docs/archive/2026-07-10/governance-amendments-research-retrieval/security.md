# Security reports — governance-amendments-research-retrieval

## governance-amendments-research-retrieval-2026-07-11.md

# Security Review — governance-amendments-research-retrieval — 2026-07-11

## Summary

Overall risk: **LOW**. The diff is two verbatim governance prose amendments (no executable surface) plus one new stdlib-only dev-time helper (`retrieve.mjs`) with no network, exec, eval, or dynamic import. The helper's only trust boundary is a developer-controlled `--root` supplied by the `research` phase (not untrusted input); `slug` is accepted but never used in path construction, so it cannot influence file access. No CRITICAL/HIGH findings. Two LOW defense-in-depth notes are recorded below; both are acceptable for a dev-time tool over a repo tree the developer already controls.

## Findings

### [LOW] Recursive corpus walk reads a symlink named `research.md`/`spec.md` by following it
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/research/retrieve.mjs:16-24, 30-36`
- **Evidence**:
  ```js
  entries = fs.readdirSync(dir, { withFileTypes: true });
  ...
  if (entry.isDirectory()) walkForNames(abs, names, acc);
  else if (names.has(entry.name)) acc.push(abs);   // matched by NAME
  ...
  return fs.readFileSync(absFile, 'utf8');           // follows symlinks
  ```
- **Impact**: A symlink named exactly `research.md`/`spec.md` planted under `docs/archive/**` would be read via `readFileSync` (which follows symlinks), so its target's matching lines could surface as a ≤160-char `excerpt` in the JSON output. `isDirectory()` on a `Dirent` does **not** follow symlinks, so symlinked *directories* are not recursed — only a symlink whose basename matches the corpus names is read. Requires write access to the repo tree, which an attacker at that level already has; output is local JSON only (no exfil channel).
- **Recommendation**: Defense-in-depth only — if desired, `lstatSync` each matched file and skip `isSymbolicLink()`, or `realpathSync` and assert the resolved path stays under `root`. Not required for the current developer-controlled-root threat model. Mirrors the accepted-risk stance of backlog `durable-plan-slug-path-traversal-hardening-7c4d`.

### [LOW] No depth/size cap on the archive walk and file reads
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/skills/research/retrieve.mjs:16-24, 30-36`
- **Evidence**:
  ```js
  function walkForNames(dir, names, acc) { ... walkForNames(abs, names, acc); }
  return fs.readFileSync(absFile, 'utf8');
  ```
- **Impact**: A pathologically deep `docs/archive` tree (recursion) or a very large `research.md` (whole-file read into memory) could slow or OOM the helper. Bounded in practice: the corpus is the project's own archive, the tool runs synchronously at dev time, and it always exits 0.
- **Recommendation**: Accept for now. If the archive grows unbounded, add a depth guard and a byte cap on `readFileSync`. No action this cycle.

## Dependencies

No new packages. `retrieve.mjs` imports only `node:fs`, `node:path`, `node:url` (Node stdlib) — U6 (no irreplaceable dependency) satisfied. `npm audit` surface unchanged (no lockfile change in the diff).

## Out of scope / Noted

- The term split `/[\s,]+/` is a linear regex (character-class + `+`); no catastrophic backtracking / ReDoS.
- `slug` is threaded through the CLI/function signature but never joined into a path — confirmed no traversal vector via `slug`.
- The governance doc edits (`CLAUDE.md`, `docs/init/seed.md`, and the two `src/*.template.md` mirrors) are prose amendments with no runtime effect; nothing to review beyond byte-equal mirror integrity (enforced by `audit-baseline`, checked in `/integrate`).

