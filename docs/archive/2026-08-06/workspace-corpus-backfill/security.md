# Security reports — workspace-corpus-backfill

## workspace-corpus-backfill-2026-08-05.md

# Security Review — main (workspace-corpus-backfill) — 2026-08-05

## Summary

Overall risk: **LOW**. The change adds five Node ESM modules and migrates a file-backed memory corpus from 14 to 112 records. There is no network surface, no authentication, no cryptography beyond a non-security content digest, and no new dependency. The only meaningful attack surface is path construction from corpus frontmatter, and every traversal path was probed empirically and rejected. One LOW finding: absolute anchors are silently reinterpreted as relative rather than rejected, which is inconsistent with the codebase's own REJECT-never-normalize rule.

**Scope note.** The diff is 2431 lines across 235 files, above the ~2000-line review cap — but 225 of those files are generated corpus records (`elements/*.md`, `diagrams/*.puml`, `concepts/*.md`) containing only repo-relative paths and titles already public in the tree. The reviewed trust surface is the 6 production modules and the store change; the generated records were scanned for secrets, not read individually.

## What was checked

| Surface | Method | Result |
|---|---|---|
| Traversal via `anchor` frontmatter → `join(rootDir, anchor)` | live probe, `../../../../etc/passwd` | rejected by `assertNoTraversal` |
| Traversal via element `id` → `join(dir, id + '.md')` | live probe, `../../escape` | rejected by `assertSafeFactKey` |
| Frontmatter injection via field value (newline → forged field) | live probe, `t\nanchor_digest: forged` | rejected by `assertSafeFieldValue` |
| Unbounded recursion in `walkFiles` (CWE-674) | live probe, symlink cycle `a/loop -> ../` | terminated in 1 ms, 1 entry — `Dirent.isDirectory()` is false for symlinks, so cycles are not followed |
| Secrets in the diff | regex scan over every changed file (key/token/password/private-key/`gh[pousr]_`/`xox[baprs]-`) | none |
| New dependencies | `git diff HEAD -- package.json` | none — `package.json` untouched |
| Secret exposure via corpus records | field inspection | records carry `id`/`kind`/`title`/`anchor`/`anchor_digest` only |

## Findings

### [LOW] Absolute anchors are silently reinterpreted as relative rather than rejected

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-22 (Improper Limitation of a Pathname)
- **File**: `.claude/skills/workspace/digest.mjs:36`, `.claude/skills/workspace/reconcile.mjs:120`
- **Evidence**:
  ```js
  const anchor = assertNoTraversal(element.anchor ?? '');   // rejects "..", not "/"
  const digest = digestFor(join(rootDir, anchor));
  // node: join('.', '/etc/passwd') === 'etc/passwd'
  ```
- **Impact**: Minimal today, and fail-safe in practice. An element whose anchor is `/etc/passwd` resolves to `<rootDir>/etc/passwd`, not the system file — the probe returned `state: "dangling"`. There is no read outside the tree. The issue is consistency, not exposure: `..` is loudly rejected as an escape attempt while `/` — the same intent expressed differently — is quietly rewritten into a different path than the author wrote. `store.mjs:24` states the principle explicitly: *"REJECT, never normalize — silently rewriting the path would read a different file than the author named."* Absolute anchors are exactly that silent rewrite.
- **Recommendation**: Extend `assertNoTraversal` to reject a leading `/` (and a Windows drive prefix) with the same error register as `..`. Roughly: `if (/^([\\/]|[A-Za-z]:)/.test(text)) throw new Error(...)`. Anchors are contracted to be repo-relative, so no legitimate anchor is affected. This is a one-line guard change plus a test, not a redesign — appropriate for a follow-up, not a blocker.

### [LOW] `materialize`'s `map` override is an unvalidated write primitive if ever exposed

- **OWASP**: A08 – Software & Data Integrity Failures | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/workspace/materialize.mjs:58`
- **Evidence**:
  ```js
  export function materialize({ memDir, rootDir = process.cwd(), map = CONCEPT_ANCHORS } = {}) {
  ```
- **Impact**: Speculative — flagged LOW on that basis. The parameter exists as a test seam (spec Contracts table) and has **no production caller** (verified: no `materialize(` call outside its own module). Element ids still pass `assertSafeFactKey` and anchors still pass `assertNoTraversal`, so even a hostile map cannot escape the corpus directory; the worst case is writing well-named junk records inside `workspace/elements/`. It becomes a real concern only if a future caller ever sources the map from outside the repo.
- **Recommendation**: Leave as-is. If a caller is ever added that does not pass the built-in constant, gate it then. Recording it so that decision is deliberate rather than inherited.

## Dependencies

No new packages. `package.json` is untouched; the change uses Node built-ins only (`node:fs`, `node:path`, and `node:crypto` via the pre-existing `digestFor`).

## Out of scope / Noted

- **`anchor_digest` is not a security control.** It is sha256-12 over a file's structural interface, used for staleness detection. Truncation to 12 hex chars is fine for drift detection and would be inadequate for integrity verification — nothing in this change treats it as the latter, and the README now states the mechanism plainly.
- **`store.mjs` is 142 substantive lines**, above the ~80 guideline. Flagged during `/simplify` for a follow-up split (corpus IO vs. working-tree walking). No security consequence; noted for continuity.
- **The corpus is now a map of the repository's own structure** — 112 records naming internal paths. This is not a disclosure concern for an open repository, but it is worth a deliberate thought if this baseline is ever installed in a closed-source project: the corpus would enumerate internal module layout in a file that ships with the memory directory. No action here; the flag `memory.architecture_map.enabled` is absent from the shipped template, so consumers get nothing by default.

