# Security reports — memory-scope-per-entry

## memory-scope-per-entry-2026-08-08.md

# Security Review — main (memory-scope-per-entry) — 2026-08-08

## Summary

Overall risk: **LOW**. The change replaces a placeholder-stamping backfill with two pure predicates and adds one new writer helper. Four of the five concerns raised in the review brief were tested and cleared — including the ReDoS question, which was measured rather than reasoned about. One genuine gap remains: `applyNarrowing` writes to a caller-supplied path with no containment check, in a subsystem whose entries routinely carry filesystem paths as their `key:`. That is prospective, not exploitable today.

## Findings

### [MEDIUM] `applyNarrowing` writes to an unvalidated caller-supplied path

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/memory-index/scope-narrow.mjs:71`
- **Evidence**:
  ```js
  export function applyNarrowing({ path, scope, governs }) {
    const text = readFileSync(path, 'utf8');
    const split = splitFrontmatter(text);
    if (!split) throw new Error(`no frontmatter block in ${path}`);
    ...
    if (patched !== text) writeFileSync(path, patched, 'utf8');
  ```
  Confirmed by probe: the function accepts `/tmp/nonexistent-probe-xyz.md` and fails only on `ENOENT`, not on a containment check.

- **Impact**: No traversal is reachable today — every call site (`tests/memory-security-followup.test.mjs:133`, `tests/memory-scope-store-invariants.test.mjs:152`, and the one-off curation pass) supplies a path built by walking `readdir` over the category directories, never derived from entry content. The hazard is prospective and specific: **in this store, an entry's `key:` is frequently a filesystem path** (`bin/cli.js:1`, `.claude/skills/memory-index/resolve.mjs:59`). The obvious next caller — a `/memory-flush` step that narrows an entry it has already parsed — would naturally reach for `entry.key` to locate the file. A `key:` of `../../..` would then escape the store. The `key:` field is free prose; `assertSafeFactKey` constrains the *filename* slug, not the key.

- **Recommendation**: Require an explicit `memDir` and assert containment before the read, rejecting rather than normalizing:
  ```js
  export function applyNarrowing({ memDir, path, scope, governs }) {
    const resolved = resolve(path);
    if (!resolved.startsWith(resolve(memDir) + sep)) {
      throw new Error(`refusing a write outside the memory store (REJECT, never normalize): ${path}`);
    }
  ```
  This is the discipline `plan-store.assertSafeSlug` and `migrate.assertSafeFactKey` already apply at comparable boundaries. Do **not** repair a bad path with `canonicalSlug` — that is a normalizer and would mask the traversal by silently writing elsewhere.

### [LOW] CLI resolves the store root from `process.cwd()`

- **OWASP**: A05 — Security Misconfiguration | **CWE**: CWE-426 (Untrusted Search Path)
- **File**: `.claude/skills/memory-index/scope-narrow.mjs:141`
- **Evidence**:
  ```js
  process.exit(run(`${process.cwd()}/.claude/memory`));
  ```
- **Impact**: Both subcommands are read-only (`report` prints proposals, `check` prints offenders and sets an exit code), so a wrong cwd yields a wrong report, not a wrong write. The operator is a developer invoking it from the repo root. Speculative — flagged LOW on that basis.
- **Recommendation**: Accept an optional root argument and default to cwd, matching the `{ rootDir }` convention every sibling helper in `memory-index/` already takes.

## Verified clear

Each was checked, not assumed.

| Concern | Method | Result |
|---|---|---|
| ReDoS in `PATH_SHAPED_KEY` and `BODY_ANCHOR` | timed against adversarial input at n = 200 → 20 000, plus multi-backtick and nested near-miss shapes up to ~320 KB | **Linear.** Worst case 2.1 ms. `/`  and `` ` `` are outside their neighbouring character classes, so segmentation is deterministic and the `(a+)(\.a+)` split backtracks linearly. Not the quadratic shape landmine `global-word-run-with-required-suffix-regex-is-quadratic-redos` describes |
| Regression of F-2 (scope probe not frontmatter-anchored) | read every scope access path | **Structurally eliminated.** `isReachable` / `assertWritable` read `entry.fields.scope` from the parser output; `applyNarrowing` and `offendersIn` go through `splitFrontmatter` / `resolveCategory`. No raw whole-file regex remains, so a body line beginning `scope:` cannot be read as the field |
| New tainted interpolation in the guard's advisory block | read the diff | **The brief was wrong.** The change adds only a boolean-driven literal `**load-bearing** `. `h.category`, `h.key` and `clip(h.hook)` were all already interpolated before this change. Backlog `advisory-block-interpolates-an-unsanitised-file-path-8c7e` is untouched — neither worsened nor addressed |
| Secrets in the 96 curated entries | pattern scan over the memory diff for keys, tokens, private-key headers | Clean. All 96 edits are `scope:` / `governs:` frontmatter lines; no body bytes changed |
| Dependency risk | `npm audit --omit=dev`, `git diff package.json` | 0 vulnerabilities; no dependency added or changed |

## Dependencies

None added. `npm audit --omit=dev` reports 0 vulnerabilities. The new module imports only `node:fs` and in-repo helpers, so the zero-runtime-dependency constraint (`constraints/zero-runtime-dependencies`) holds.

## Out of scope / Noted

- **`assertWritable` is a contract, not a control.** It refuses unreachable entries at the write boundary, but nothing forces a caller through it — a writer that calls `writeFileSync` directly bypasses it entirely. That is the same shape as every other convention-enforced writer in this store and is not a regression; noted so a future reviewer does not mistake it for a guarantee.
- **`resolve.mjs` is now 193 lines carrying two concerns** (derived-index lookups and the reachability predicates). `/simplify` flagged the split as needing its own spec. No security consequence; recorded for continuity.

