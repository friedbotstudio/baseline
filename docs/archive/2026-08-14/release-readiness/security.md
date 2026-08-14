# Security reports — release-readiness

## release-readiness-2026-08-14.md

# Security Review — main (release-readiness batch) — 2026-08-14

## Summary

Overall risk: **LOW**. Seven tickets reviewed individually per the `power` track contract; no ticket raised a BLOCKER, so the batch does not yield. The diff adds three modules and two file writers, and every path-taking entry point in the new code routes through the existing `assertNoTraversal` guard — verified by execution, not by reading. One MEDIUM is **pre-existing and not introduced here**, but this diff edits the exact config value it depends on, so it is reported rather than left in Out-of-scope.

Diff reviewed: 21 files, 486 insertions, 45 deletions. No new dependencies; `npm audit --omit=dev` reports 0 vulnerabilities.

## Per-ticket verdicts (`power` track — once per ticket)

| Ticket | Write surface reviewed | Verdict |
|---|---|---|
| T1 | `project.json → test.cmd`, `docs/system/README.md`, 4 test files | **MEDIUM** (finding 1, pre-existing vector) |
| T2 | `memory-sync/census-gate.mjs`, `census-measures.mjs` | **LOW** (findings 2, 3) |
| T3 | `tdd/drift_check.mjs` `probeRunnable` | clean |
| T4 | `harness/assemble-context.mjs`, `harness/checker-fanout.mjs`, `integrate/SKILL.md` | clean |
| T5 | `workspace/queries.mjs` `parseTouchedPaths`, `archive/SKILL.md` | clean |
| T6 | `harness/rightsize-gate.mjs` `normaliseDiffPath` | clean |
| T7 | `tests/character-doctrine-audit.test.mjs` | clean |
| *(simplify)* | `workspace/tree.mjs` `writeSourceText`, `store.mjs`, `delta.mjs` | **LOW** (finding 4) |

## Findings

### [MEDIUM] The binding test command is shell-interpolated with a changed file's path

- **OWASP**: A03 – Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `.claude/hooks/test_runner.mjs:73-76`, value at `.claude/project.json` → `test.cmd`
- **Evidence**:
  ```js
  let final = String(cmd).replaceAll('{file}', rel).replaceAll('{affected}', affected);
  const proc = spawnSync('bash', ['-lc', final], {
  ```
- **Impact**: `rel` is derived from `tool_input.file_path` on the write that triggered the hook. A file whose *name* contains shell metacharacters — `a$(id).mjs`, ``a`cmd`.mjs``, `a;rm -rf x.mjs` — is interpolated into a string handed to `bash -lc`, so the metacharacters execute. Reaching it requires inducing a write to a maliciously-named path (a hostile spec, intake, or repo checkout), which is why this is MEDIUM and not HIGH.
- **Not introduced by this change.** The `{file}` → `bash -lc` path predates it. This review reports it because T1 edits `test.cmd` itself, and the edit makes the shell interpretation explicit — the value now contains a literal `&&`, which only functions because the string is shell-parsed. Anyone reading the new value should know the interpolation is live.
- **Recommendation**: quote the substitution (`--file="{file}"` is insufficient against `$` and backticks) or, properly, stop shell-interpolating: split `test.cmd` into argv and `spawnSync` without `bash -lc`, passing `rel` as its own argument. The `&&` chain would then become two sequential spawns with the first non-zero exit winning — the same semantics the four-line verdict contract already describes.

### [LOW] The census gate rewrites only the first occurrence of a literal

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-670 (Always-Incorrect Control Flow)
- **File**: `.claude/skills/memory-sync/census-gate.mjs:64`
- **Evidence**:
  ```js
  writeFileSync(absolute, text.replace(literalPattern(reading.symbol), `$1${reading.to}`), 'utf8');
  ```
- **Impact**: `String.replace` with a non-global regex substitutes the first match only. A site file declaring the same symbol twice keeps a stale second copy, and the gate reports `remeasured: true` — a claim stronger than what happened. Integrity of a self-maintaining count, not a memory-safety issue.
- **Recommendation**: verify the post-write value by re-reading and re-measuring, and set `refused: true` when it still disagrees. That closes the class rather than the instance — a rewrite that silently under-applies is exactly the failure the gate exists to prevent, reproduced one layer in.

### [LOW] A declared site with an unknown measure throws past the gate's verdict

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-703 (Improper Check for Exceptional Conditions)
- **File**: `.claude/skills/memory-sync/census-measures.mjs:19-22`, reached from `census-gate.mjs:52`
- **Evidence**:
  ```js
  const counter = MEASURES[measure];
  if (!counter) throw new UnknownMeasureError(measure);
  ```
- **Impact**: `UnknownMeasureError` propagates out of `measureCensusMovement` instead of returning `refused: true`. A caller that does not catch it sees a crash rather than a refusal, and a `/memory-sync` that crashes mid-flush is less recoverable than one that declines to write. Already recorded as a `flagged` row at `/simplify`.
- **Recommendation**: catch it in `readSite` and return the existing `{unreadable: true, reason}` shape, which the refusal path already handles. No new mechanism needed.

### [LOW] `writeSourceText` does not create a missing parent directory

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-703
- **File**: `.claude/skills/workspace/tree.mjs:41-46`
- **Evidence**: verified by execution — `writeSourceText('/tmp/nope-does-not-exist-xyz', 'a.md', 'x')` throws `ENOENT`.
- **Impact**: none today; the only caller writes `README.md` into a `specDir` that must already exist for the read half to have worked. Noted because the sibling writer `writeWorkspaceFile` *does* `mkdirSync -r`, so the asymmetry will surprise the next caller.
- **Recommendation**: leave as-is, or document the asymmetry in the function's comment. Adding `mkdirSync` speculatively is the YAGNI this repo's ladder warns against.

## What was verified by execution, not by reading

Absence of an obvious exploit is not evidence of safety, so the guards were exercised rather than eyeballed:

| Probe | Input | Result |
|---|---|---|
| `parseTouchedPaths` (new JSON branch) | `["../../etc/passwd"]` | REJECT — traversal |
| `parseTouchedPaths` (new JSON branch) | `["/etc/passwd"]` | REJECT — absolute prefix |
| `parseTouchedPaths` | `[{"a":1}]`, `[123]` | coerced to `"[object Object]"`, `"123"` — harmless, matches no anchor |
| `parseTouchedPaths` | `not json[` | falls through to the comma path, no throw |
| `writeSourceText` | `../etc/passwd` | REJECT — traversal |
| `writeSourceText` | `/etc/passwd` | REJECT — absolute prefix |
| `census-gate` `sites[].file` | routed through `assertNoTraversal` at `census-gate.mjs:39` | guarded before any path is built |
| `assemble-context` | `execFileSync('git', ['-C', rootDir, ...args])` | no shell; args are module constants, not caller input |

`literalPattern` builds a `RegExp` from `site.symbol`, escaped through `escapeRegExp`, so a symbol containing regex metacharacters cannot alter the pattern. The pattern `(symbol\s*=\s*)(\d+)` separates its two `\s*` quantifiers with a literal `=`, so it carries none of the adjacent-unbounded-quantifier backtracking the landmine `adjacent-unbounded-quantifiers-are-quadratic-even-when-anchored` records.

## Dependencies

No packages added or changed in this diff. `npm audit --omit=dev`: **0 vulnerabilities**.

## Out of scope / Noted

- `.claude/skills/memory-index/` ships without `owner: baseline`, so `categories.mjs` — now the single oracle four modules derive from — sits outside manifest hash verification. Backlog `memory-index-ships-unhashed-while-being-a-shared-oracle-d5b6`. Not touched by this diff; the value of that oracle rose again this cycle without its protection changing.
- `SCAN_ROOTS` gives `commands`, `agents` and `output-styles` a top-level-only finder, so a subdirectory added under any of them ships unscanned by the component that gates publishing. Backlog `shipped-subdirs-under-flat-scan-descriptors-go-unscanned-a3f8`. Unchanged here.

