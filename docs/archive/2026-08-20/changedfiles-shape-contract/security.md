# Security reports — changedfiles-shape-contract

## changedfiles-shape-contract-2026-08-20.md

# Security Review — main — 2026-08-20

## Summary

Overall risk: **MEDIUM**. The change gives the code-review fan-out real input for the first time, and one consequence is that repo-controlled filenames now reach a finding message that never sanitizes them — a path that was structurally unreachable before this diff. No injection, no secret, no auth surface, and no new dependency. The one MEDIUM is a reachability change this diff creates rather than a flaw it introduces.

Reviewed: `git diff HEAD` (7 files, 108 insertions, 14 deletions) plus the two untracked files this branch adds. Re-reviewed after the AC-009 / AC-010 amendment brought `.claude/skills/simplify/` into the write set; that round added one finding and widened another. Checked OWASP A01–A10 against each trust boundary, secrets hygiene, input validation at the `git` and filesystem boundaries, argv construction, and dependency delta. `npm audit --omit=dev` reports 0 vulnerabilities.

## Findings

### [MEDIUM] Repo-controlled filenames reach oracle finding text unsanitized

- **OWASP**: A03 – Injection | **CWE**: CWE-117 (Improper Output Neutralization for Logs), CWE-150 (Improper Neutralization of Escape Sequences)
- **File**: `.claude/skills/code-structure/oracle.mjs:65`, `:88`; `.claude/skills/simplify/oracle.mjs:33`, `:35`
- **Evidence**:
  ```js
  message: `${file.path} has ${lines} substantive lines; split along layer lines (code-structure).`,
  ...
  message: `${file.path} carries ${ratio.toFixed(2)} body comments per substantive line; ...`,
  ```
- **Reachability**: measured, not inferred. `runCodeStructureOracle` with `path: ".claude/x[2J.mjs"` yields a finding whose `message` carries the raw `ESC [ 2J` bytes. Before this diff the oracle read `file.content` off a bare path string, `substantiveLineCount(undefined)` returned 0, and no finding was ever constructed — so the interpolation existed but nothing could reach it. Hydrating the producer makes it live.
- **Impact**: a contributor able to land a file whose name carries terminal control bytes can inject escape sequences into the merged verdict when a maintainer renders it (`/integrate` surfaces BLOCKER findings to the terminal, and the verdict is persisted to `.claude/state/checker-fanout-code/<slug>.json`). Screen-clearing, cursor manipulation, and text overwriting are the practical outcomes; the review can be made to display a finding other than the one it produced. Requires commit or PR access, which is what holds this below HIGH.
- **Second site (added in the AC-009 round)**: `simplify/oracle.mjs` interpolates the verdict table's file cell into `message` the same way, and the same probe confirms control bytes survive into the finding. The interpolation predates this branch, but the branch touches those lines, so it is named here rather than left for the sibling backlog entry alone.
- **Recommendation**: import the shared sanitizer and clip the path at every interpolation site in both oracles — `import { clip } from '../lib/terminal-text.mjs'`, then `clip(file.path)` in `message` and `evidence`. The sibling checker already does exactly this (`.claude/skills/harness/checkers/backlog-deferral.mjs:7,53`), and `tests/terminal-text.test.mjs` asserts that no consumer rolls its own control-character rule. Related open backlog: `advisory-block-interpolates-an-unsanitised-file-path-8c7e`.

### [MEDIUM] A filename containing a pipe silently removes its row from the review gate

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-707 (Improper Neutralization)
- **File**: `.claude/skills/simplify/oracle.mjs:19-25`
- **Evidence**:
  ```js
  const cells = line.split('|').map((c) => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells.length >= 2 && cells[0].length > 0 ? cells : null;
  ```
- **Reachability**: measured. A verdict-table row for a path `a|b.mjs` parses to `['a', 'b.mjs', 'flagged', ...]`, so cell 1 holds a filename fragment rather than `flagged`, the row is skipped, and the oracle returns **zero** findings for a file the reviewer explicitly flagged.
- **Impact**: a contributor who names a file with a pipe evades the flagged-row gate entirely. `/simplify` still reports the flag to the human in its table, so this is a bypass of the mechanical gate rather than of the whole review — but the mechanical gate is what blocks the landing. The delimiter is a plain `split`, and a pipe is a legal filename character on macOS and Linux.
- **Status**: pre-existing. The old parser broke on the same input for the same reason. It is recorded now because this round closed the sibling silent escape — an empty reason cell used to make a flagged row vanish the same way (probe: that row now emits a BLOCKER) — and closing one while leaving the other undocumented would misrepresent how tight the gate is.
- **Recommendation**: escape or reject a pipe in the file cell when the table is written, or parse the row with a delimiter the path cannot contain. Do not fix it by counting cells from the right; a reason cell may legitimately contain a pipe too.

### [LOW] Whole-file contents are read into memory with no size bound

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **File**: `.claude/skills/harness/assemble-context.mjs:56`, `:62`
- **Evidence**:
  ```js
  content = String(readFile(join(rootDir, path)));
  ...
  prior = String(exec(rootDir, ['show', `HEAD:${path}`]));
  ```
- **Impact**: every changed file is held in memory twice (working tree plus `HEAD`), including binaries, with no cap. A diff touching a large vendored blob doubles that blob in the fan-out's heap. This is a local developer tool bounded by the repo the operator already checked out, so the practical ceiling is self-inflicted.
- **Recommendation**: accept, or bound it — skip hydration for paths whose `statSync().size` exceeds a threshold and mark the element so the oracle can report `not-measured` rather than a misleading zero. Speculative as an attack; recorded as LOW because the resource is real and the bound is absent.

## Dependencies

No package added, removed, or version-changed. `git diff HEAD -- package.json` is empty. `npm audit --omit=dev` → **found 0 vulnerabilities**. Every import on the changed path is a Node built-in (`node:child_process`, `node:fs`, `node:path`) already in use in these modules.

## Checked and clean

- **Command injection (CWE-78)** — `execFileSync('git', ['-C', rootDir, ...args])` takes an argv array with no shell. The one interpolated argument is `` `HEAD:${path}` ``, which always begins with the literal `HEAD:`, so a path beginning with `-` can never be parsed as a git flag.
- **Path traversal (CWE-22)** — paths originate from `git diff --name-only HEAD`, and git rejects `..` components in tracked paths. `join(rootDir, path)` on such a path cannot escape the root. A crafted path that somehow did would fail the `readFile` and be dropped, not followed.
- **Severity-downgrade input** — the `inherited:` prefix that downgrades a finding to ADVISORY is read from the reviewer-authored reason cell, not from repository content. A repository cannot place text in that cell: a path is written to the file cell, and a path crafted to look like the prefix lands in the wrong cell entirely. The regex is anchored and literal, so it carries no backtracking cost.
- **Error-path information disclosure** — `assertChangedFilesShape` interpolates only the array index and `typeof`, never the path or content, so a hostile element cannot reach the terminal through the throw.
- **Secrets** — no literal token, key, credential, or `.env` reference in the diff.
- **AuthN / AuthZ, crypto, SSRF** — no such surface in the changed files.

## Out of scope / Noted

- **Untracked files are invisible to every code-review checker.** `assembleChangedFiles` uses `git diff --name-only HEAD`, which does not list untracked paths. This branch's own new 296-line test file therefore never reaches the oracle. AC-003's BLOCKER case — a file this change *created* and pushed over budget — cannot currently be triggered through the live producer at all. Pre-existing probe behaviour that decision D1 deliberately left alone; the gate is weaker than the spec implies until it is addressed.
- **The empty-reason silent escape is closed.** A `flagged` row with no reason used to parse to two cells, fall under a `length >= 3` check, and emit nothing — an unreasoned flag left the gate with no trace. AC-009 makes it a BLOCKER, and the probe confirms it. Its sibling, the pipe-in-filename escape, is recorded as a finding above rather than here, because it is still open.
- **A filename containing a newline splits into two garbage paths.** `git diff --name-only` quotes such paths, and the producer's `.split('\n')` predates this diff. Both fragments fail their `readFile` and are dropped, so the failure mode is silent under-reporting rather than corruption. Not introduced here; worth a backlog entry beside the item above.

