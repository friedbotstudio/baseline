# Security reports — skill-helper-cli-dispatchers

## skill-helper-cli-dispatchers-2026-08-08.md

# Security Review — skill-helper-cli-dispatchers — 2026-08-08

## Summary

Overall risk: **LOW**. The change adds five `process.argv` entry points that reach the filesystem and one that spawns a JVM. Every guard the design depends on was probed live rather than read: the spawn is argv-array (no shell), both write paths reject newline forgery, and the `--spec-dir` traversal asymmetry found during `/simplify` is confirmed closed on all three dispatchers. Two LOW findings remain, both bounded by the fact that these are developer-tree CLIs whose caller already holds shell access — neither crosses a privilege boundary.

**Threat model, stated explicitly.** These dispatchers are invoked from SOPs and by the operator in a local checkout. There is no network listener, no authentication boundary, and no remote input. A finding here is only meaningful if it lets a caller do something they could not already do with a shell, or if it lets *content* (transcript text, corpus records) act as *code*. Severity is rated against that, not against a server threat model. Rating these HIGH because they touch `writeFileSync` would be inflation.

## Findings

### [LOW] SOP teaches single-quote interpolation of a key that can contain a quote

- **OWASP**: A03 - Injection | **CWE**: CWE-78 (argument injection, non-crossing)
- **File**: `.claude/skills/memory-flush/SKILL.md:175`
- **Evidence**:
  ```
  node .claude/skills/memory-flush/cli.mjs ledger --key '<FULL ## CANDIDATE: header text>' --disposition promoted|discarded
  ```
- **Impact**: Candidate headers are auto-extracted from conversation content. The intent-derived shape is safe — `slugWords` builds it from an allowlist (`/[a-z0-9]+/g`), so every metacharacter is stripped, verified by probe (`it's a quoted thing` → `it-s-a-quoted-thing`). The landmark shape is `<path> → landmarks.md`, and a path is not slugified, so a repository file named with an apostrophe yields a key that terminates the SOP's single quote early. The result is a broken command or stray shell tokens. Creating such a file already requires write access to the checkout, so no privilege is gained; this is a robustness defect at a place that *looks* like a trust boundary.
- **Recommendation**: Have the SOP show a quoting-safe form rather than raw single quotes — pass the key via stdin or a file, or instruct `--key "$KEY"` with the value assigned in a prior statement. Do not "fix" this by stripping quotes from keys: the key is a join value used by `decidedKeys()` for suppression matching, and normalizing it would silently break the match.

### [LOW] `--root`, `--mem-dir`, and absolute `--spec-dir` are unvalidated

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (path traversal, no boundary crossed)
- **File**: `.claude/skills/workspace/queries.mjs:31`, `.claude/skills/memory-index/cli.mjs:15`
- **Evidence**:
  ```js
  export function corpusDir({ flags, root }) {
    const given = flags['spec-dir'];
    if (!given) return join(root, 'docs/system');
    if (isAbsolute(given)) return given;   // absolute paths accepted as-is
    assertNoTraversal(given);
    return join(root, given);
  }
  ```
- **Impact**: A caller can point any dispatcher at an arbitrary directory, and `memory-index constraint --root <dir>` will create `<dir>/.claude/memory/constraints/`. Probed: `graph --json --root /etc` exits 0 with a well-formed empty document, because the flag gate finds no `project.json` and returns before any corpus read — the fail-safe works. No read or write is reachable that the caller could not perform directly with their own shell, so this grants no privilege.
- **Recommendation**: Accept as designed, or constrain `--root` to the git worktree if these dispatchers are ever invoked from a context where the caller is *not* already the operator. Record the assumption rather than silently relying on it.

## Verified safe (enumerated, not assumed)

| Surface | Probe | Result |
|---|---|---|
| JVM spawn via `view --render --jar` | `--jar "/tmp/x; touch <tmp>/pwned"` | exit 2, treated as a filename, **0 files created**. `spawnSync('java', ['-jar', resolve(jarPath), ...])` is argv-array; no shell. |
| Remote-server fallback on render | jar-absent path | exits 2 naming the jar; no `plantuml.com`/HTTP reference. The deliberate no-fallback rule holds. |
| Ledger key forgery | key containing `\n` | rejected — `isCandidateKey` + explicit `[\r\n]` guard. Prior finding F-3 defense intact. |
| Constraint frontmatter forgery | `--governs $'src/**\nstate: false'` | rejected — `unsafe field value (REJECT, never normalize)`. `assertSafeFieldValue` reached before interpolation. |
| Constraint key | reaches `assertSafeFactKey` | dispatcher passes through; guard not weakened. |
| `state` coercion | `--state perhaps` | exit 1 at the dispatcher; `writeConstraint` additionally coerces to boolean. |
| Element id traversal | `describe ../../etc/passwd`, `a/../../b` | exit 1, message names the unsafe input, **no ENOENT** — validation precedes path construction. |
| `--spec-dir` traversal, all three dispatchers | `--spec-dir ../../../etc` | exit 1 on workspace, memory-flush, system-reconcile. The `/simplify` fix is confirmed. |
| PlantUML title injection | `view` title source | title comes from the corpus record, not argv, and `composeView` validates it via `assertSafeFieldValue` (2026-08-05 MEDIUM). Dispatcher does not bypass it. |
| `--hops` unbounded traversal | `--hops 99`, `--hops 0` | rejected at max 5; clamped to 1. Bounded. |

## Dependencies

No new packages. `package.json → dependencies` remains `{"@clack/prompts":"1.4.0"}` and is unchanged by this diff. Every new module imports Node builtins only (`node:util`, `node:fs`, `node:path`, `node:child_process`), so the `zero-runtime-dependencies` constraint (`state: true`) still holds. No CVE surface added.

## Out of scope / Noted

- **Second-order corpus trust.** `graph --json` and `describe` emit element titles, anchors and shard kinds read from `docs/system/`. Those records are reviewed spec artifacts under version control, so they are trusted input here. If the future operator GUI renders that JSON as HTML, the GUI owns output encoding — the dispatcher emits data, not markup, and `JSON.stringify` is the only serializer used.
- **`memory-index constraint --mem-dir`** accepts any directory with no validation, same class as the `--root` finding and the same non-boundary reasoning.
- **Pre-existing, unrelated to this diff**: `tests/memory-scope-store-invariants.test.mjs → test_when_path_leg_measured_then_governs_hit_counts_unchanged` fails on a clean tree at HEAD `b164ae7`. Verified in a detached worktree. Filed as a landmine; not a security issue.

