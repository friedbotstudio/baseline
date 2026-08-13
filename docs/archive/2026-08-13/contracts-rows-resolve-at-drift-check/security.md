# Security reports — contracts-rows-resolve-at-drift-check

## contracts-rows-resolve-at-drift-check-2026-08-13.md

# Security Review — main (contracts-rows-resolve-at-drift-check) — 2026-08-13

## Summary

Overall risk: **LOW**. One LOW finding: `probeRunnable`'s containment check is lexical, so a symlink planted inside the repo defeats it and the probe reads the link's target outside the root. The leak is one bit per probe, not file contents, and it needs PR-level access to plant both the link and the spec row that names it. The three other seams the reviewer flagged — ReDoS over authored text, argv injection in the git spawns, and denial-of-service through a poisoned Contracts row — were each tested and are not exploitable.

What changed: `.claude/skills/tdd/drift_check.mjs` (+175/−8), one new test file, and three unrelated census literals. The `## Contracts` table was inert prose before this change and is now input that drives a filesystem read — that is the trust boundary this review is about.

## Findings

### [LOW] The containment check is lexical, so a symlink escapes it

- **OWASP**: A01 — Broken Access Control | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/tdd/drift_check.mjs:246-252`

- **Evidence**:
  ```js
  export function probeRunnable(rootDir, relPath) {
    const root = resolve(rootDir);
    const target = resolve(root, relPath);
    if (target !== root && !target.startsWith(root + sep)) return 'refused';
    let text;
    try { text = readFileSync(target, 'utf8'); } catch { ... }
  ```

- **Impact**: `resolve()` is purely lexical and does not follow links, so a symlink whose *path* lies inside the root passes the guard and `readFileSync` then follows it to a target anywhere on the filesystem. Measured against a live probe:

  | Attack | Verdict |
  |---|---|
  | `../outside/secret.mjs` | refused |
  | `sub/../../outside/secret.mjs` | refused |
  | absolute path | refused |
  | null byte injected | refused |
  | `./../outside/secret.mjs` | refused |
  | **symlinked FILE inside the root** | **runnable** |
  | **symlinked DIRECTORY inside the root** | **runnable** |

  Each escaping target was made deliberately runnable, so `runnable` proves the file was opened rather than merely reachable.

  The leak is narrow: the return value is one of `runnable` / `absent` / `not-runnable`, so an attacker learns a single bit — whether the target contains a main guard or a top-level `dispatch(`/`main(`/`run(` call. Not contents. Exploitation needs the ability to land both a symlink in the repo and a spec whose Contracts row names it, which on this project is PR-level access; and the resulting bit surfaces only in `.claude/state/drift/<slug>.md`, which is gitignored.

- **Recommendation**: `lstatSync(target, { throwIfNoEntry: false })` and return `refused` when `isSymbolicLink()`, before the read. Two lines. This is the same defect and the same fix as the 2026-08-12 review of `restore-degraded-shards.mjs` (`classifyEntry`), and the consistency matters as much as the bit: the repo now has two path-probing functions in shipped modules, and a reader who sees the guarded one will assume the pattern holds in both.

## Verified safe — tested, not assumed

| Seam | Test | Result |
|---|---|---|
| ReDoS: unclosed Contracts section | 20k-row table through `extractContractRows` | 31.5 ms, linear |
| ReDoS: unbalanced backticks | 40k unclosed backticks through `contractTokens` | 0.1 ms |
| ReDoS: nested placeholders | 20k nested `<` then 20k `>` | 0.1 ms |
| ReDoS: long unbroken atom | 200k-char backticked token | 0.5 ms |
| ReDoS: alternating brackets | 30k × `[a]{b}(c)<d>` | 4.8 ms |
| Path traversal, absolute paths, null bytes | five shapes, table above | all `refused` |
| Argv injection in the git spawns | read the argv arrays | not applicable — see below |
| Denial of service via a poisoned row | reasoned over the scoring scope | the feature working — see below |

**No ReDoS.** All five pathological inputs are linear. `CONTRACTS_SECTION_RE`'s lazy `[\s\S]*?` has a literal-anchored lookahead, and `PLACEHOLDER_RE`'s alternation contains no nested quantifier, so neither can backtrack catastrophically.

**Argv injection does not apply, and for a simpler reason than the reviewer expected.** `sweepArchivedSpecs` runs `git log --diff-filter=A --format=%H -- <rel>` — the `--` separator is present, so a path beginning with `-` is a pathspec rather than an option. The second spawn is `git show <sha>` with **no path argument at all**; the reviewer's concern about a missing `--` before a `git show` path is moot because there is no path there. Both spawns use `spawnSync` with an argv array, so there is no shell and no word-splitting. `<rel>` comes from a `readdirSync` walk of `docs/archive/`, so it names a file that exists.

**A poisoned Contracts row is the feature, not a finding.** An `unresolved` row halts the workflow, and authored content decides it. But `drift_check` scores only the *current workflow's own* spec, resolved through `resolveSpecPath` from `workflow.json → slug`. There is no path by which one spec's rows affect another workflow's exit code, so the blast radius is the author's own run — which is exactly what a drift gate is for. The under-reporting design (D5) means the failure direction is silence rather than spurious halting: an uncheckable row reads `skipped` and never reaches the exit count.

## Remediation — fixed in this workflow, 2026-08-13

`probeRunnable` now realpaths the target and rejects anything whose resolved path leaves the root. `realpathSync` was chosen over `lstatSync` because it resolves the whole chain: a per-entry `lstat` catches a symlinked file but misses a symlinked **parent directory**, and the probe above proved both escape.

Post-fix, every one of the seven attack shapes reads `refused` and the in-root control still probes normally:

```
plain traversal / deep traversal / absolute path / null byte / dot-slash   refused
symlinked FILE inside root                                                refused
symlinked DIRECTORY inside root                                           refused
control: real in-root file                                                not-runnable
```

Regression test: `test_when_the_target_is_a_symlink_out_of_the_root_then_the_probe_refuses`, covering both the file and the directory shape. Both link targets are deliberately runnable, so `refused` proves the file was never opened rather than proving it was unreachable.

**One trap on the way in, worth recording.** Realpathing only the target broke three passing tests: on macOS `/tmp` is itself a symlink to `/private/tmp`, so every `mkdtemp` root read as an escape. Both sides must be realpathed — which `isRunAsScript` in this same module already documents for the identical reason. A one-sided realpath is a false-positive generator, not a guard.

Post-fix: `npm test` 2758 tests, 2742 pass, 0 fail. `npm run build` exit 0.

## Dependencies

No new packages. `package.json` and `package-lock.json` are unchanged in this diff. `node:fs`, `node:path` and `node:child_process` were already imported by this module; the change adds `readdirSync` and `sep` to existing import statements and nothing else.

## Out of scope / Noted

- **No secret material and no new write target.** The module's only write remains `.claude/state/drift/<slug>.md`. The new code reads spec text, the working-tree diff, and probed files; it writes nothing else.
- **`sweepArchivedSpecs` ships but is test-only** — flagged at `/simplify` for a follow-up, and worth repeating here for a different reason: it spawns two git subprocesses per archived spec, so a consumer who called it on a large archive would fork ~200 processes. It has no production caller today, which bounds the concern to whoever imports it deliberately.
- **The one-bit oracle is worth remembering if `probeRunnable` ever grows a richer return.** Today it reports a state; if a future change returned the matched line or the file's size, the same symlink path would leak proportionally more. Fixing the link-following now closes that upgrade path as well.

