# Security reports — architecture-map

## architecture-map-2026-08-05.md

# Security Review — main (architecture-map) — 2026-08-05

## Summary

Overall risk: **MEDIUM**. One confirmed injection into a generated PlantUML document via an unvalidated `title` parameter (ticket C); I reproduced the injection but could not escalate it to file disclosure on the vendored jar. Everything else is LOW and needs repository write access to reach. No new dependencies, no secrets in the diff. Per-ticket review ran for all six tickets on the `power` track; none raised a BLOCKER.

Reviewed: 9 tracked files changed (+323/-15) plus 15 untracked, across `.claude/skills/workspace/**`, `.claude/skills/memory-index/resolve.mjs`, `.claude/hooks/lib/memory_session_start.mjs`, `.claude/skills/tdd/drift_check.mjs`, and the authored corpus under `.claude/memory/workspace/**`.

## Per-ticket verdicts (`power_batch_reviews`)

| ticket | security-flagged | verdict | note |
|---|---|---|---|
| A — concept layer | no | CLEAN | ids validated before any read; no shell, no interpolation into an interpreter |
| B — edge derivation | no | CLEAN (1 LOW) | scanners are read-only regex over source; see LOW-3 |
| C — shards and views | **yes** | **1 MEDIUM** | command execution + document composition |
| D — staleness | **yes** | 2 LOW | traversal guard holds; defense-in-depth gaps only |
| E — retrieval | **yes** | 1 LOW | new injection path into session-start model context |
| F — drift checker | no | CLEAN | narrows what the checker trusts; removes a self-certification path |

## Findings

### [MEDIUM] PlantUML directive injection via unvalidated `title` — FIXED IN THIS CYCLE

> **Resolved 2026-08-05**, folded into ticket F at the maintainer's direction rather than deferred.
> `composeView` now calls `assertSafeFieldValue('title', title)` before assembling the document, so a
> `\r` or `\n` in the title is REJECTED (never normalized). Regression:
> `tests/workspace-shards.test.mjs → test_when_title_carries_a_newline_then_composition_is_refused`.
> The finding is kept below in full rather than deleted — the record of what was found is the point.

- **OWASP**: A03 – Injection | **CWE**: CWE-94 (code injection), CWE-74
- **File**: `.claude/skills/workspace/render.mjs:39`
- **Evidence**:
  ```js
  export function composeView(memDir, { elements = [], weights = null, title = 'workspace view' } = {}) {
    const lines = [...HEADER, `title ${title}`];
  ```
  Reproduced with `title = 'x\n!include /etc/passwd'`:
  ```
  @startuml
  !include <C4/C4_Component>
  title x
  !include /etc/passwd        <-- attacker-controlled directive
  !includesub workspace/diagrams/alpha.puml!alpha
  ```
- **Impact**: a caller-supplied `title` containing a newline injects arbitrary directives into a document that PlantUML then parses with file-reading capability. **Escalation attempts failed on this jar**: a naive `!include` of a non-PlantUML file aborts the render (exit 200, syntax error), and `%loadfile` is rejected as an unknown built-in on `plantuml@1.2026.2`. Demonstrated impact is therefore denial-of-render plus full control of the generated document, **not** confirmed file disclosure. The severity would rise if the jar were upgraded to a version exposing file-reading built-ins, which is why this should be fixed at the boundary rather than left to the interpreter's current feature set.
- **Recommendation**: reject newlines in `title` at the composition boundary, mirroring the existing precedent — `assertSafeFieldValue` in `.claude/skills/memory-index/migrate.mjs:61` already REJECTS (never normalizes) `[\r\n]` in any interpolated frontmatter field, for exactly this forging reason. Reuse it: `assertSafeFieldValue('title', title)` in `composeView` before building `lines`. Every other interpolated value in this path is already bounded — `shard.section` by `/^!startsub\s+([A-Za-z0-9_-]+)\s*$/`, and `shard.path` by `assertNoTraversal`.

### [LOW] `digestFor` is exported without its own traversal guard

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/workspace/reconcile.mjs:106`
- **Impact**: in-module callers reach it only through `classify`, which validates every anchor first (`reconcile.mjs:133`), so the live path is safe. A future external caller passing an unvalidated path would read any file the process can read. Speculative — no such caller exists today.
- **Recommendation**: call `assertNoTraversal` inside `digestFor` as defense-in-depth, so the guarantee holds per-function rather than per-call-site.

### [LOW] Anchors are followed through symlinks

- **OWASP**: A01 – Broken Access Control | **CWE**: CWE-59
- **File**: `.claude/skills/workspace/store.mjs:35-43`
- **Impact**: `readSourceText` uses `statSync`/`readFileSync`, which follow symlinks. An element anchored at an in-repo path that is a symlink out of the tree would be read and digested. Requires write access to the repository to plant both the symlink and the element record.
- **Recommendation**: accept for now (the corpus is maintainer-authored and in-repo). If the corpus ever accepts contributed elements, switch to `lstatSync` and refuse symlinked anchors.

### [LOW] Corpus values are interpolated into session-start model context

- **OWASP**: A03 – Injection | **CWE**: CWE-94
- **File**: `.claude/hooks/lib/memory_session_start.mjs` (`renderConceptMap`)
- **Evidence**:
  ```js
  lines.push(`- \`${concept.id}\` — ${concept.title} (${concept.members.length} elements)`);
  ```
- **Impact**: concept `title` is read from corpus files and injected into the additionalContext block the model receives at session start — a prompt-injection surface that did not exist before this change. Bounded in practice: `parseEntry` matches frontmatter with `^([A-Za-z_][A-Za-z0-9_-]*):(.*)$` per line, so a stored value cannot span lines, and `id` is constrained by `assertSafeFactKey` to `^[a-z0-9][a-z0-9-]*$`. The residue is one line of attacker-chosen markdown, and planting it requires repository write access.
- **Recommendation**: no change required for this threat model. Record it as a known property: the concept layer is now an input to model context, so corpus write access carries context-injection weight it did not carry when the corpus was scout-only.

### [LOW] Line-length-quadratic backtracking in two scanner regexes

- **OWASP**: A04 – Insecure Design | **CWE**: CWE-1333
- **File**: `.claude/skills/workspace/reconcile.mjs` (`HEADING`), `.claude/skills/workspace/edges.mjs` (`RELATIVE_IMPORT`)
- **Impact**: `/^#{1,6}\s+(.+?)\s*$/gm` backtracks quadratically on a pathological single line of whitespace; `RELATIVE_IMPORT`'s clause is capped at 400 chars and lazy. Neither is exponential, both are bounded by line length, and inputs are in-repo source files. Noted because this subsystem already carries a ReDoS fix (`index-io.mjs` `MAX_WILDCARDS`, security review F-3) — the same class, far weaker instance.
- **Recommendation**: none now. Revisit if the scanners are ever pointed at untrusted input.

## Dependencies

No dependency change in this diff — `package.json` and `package-lock.json` are untouched, and the project's zero-runtime-dependency posture holds (`dependencies` remains `@clack/prompts@1.4.0`, pre-existing and unmodified). New code uses only Node built-ins: `node:fs`, `node:path`, `node:crypto`, `node:child_process`. No CVE surface added.

External process invoked: `java -jar <vendored plantuml.jar>` via `spawnSync` with an **argument array**, not a shell string — no shell metacharacter interpretation, and `jarPath` is `resolve()`d rather than interpolated. Existence is checked before spawn, and the remote PlantUML server is deliberately excluded from the composition path.

## Out of scope / Noted

- **Secrets sweep**: clean. No API keys, tokens, private keys, or `.env` content in the diff.
- **Traversal probe**: an element id of `../../../../etc/passwd` through `composeView` is rejected by `assertNoTraversal` before any filesystem access — verified, not assumed.
- **`.claude/state/` excluded from the drift diff** (ticket F) narrows what `drift_check` treats as evidence and removes a path where the checker certified itself. Security-positive.
- **NUL byte found and removed from `roll.mjs`** during `/simplify`. Not an exploit, but it made the module classify as binary, so `git diff` emitted `Binary files differ` and the file's contents were invisible to diff-reading review. A source file that reviews as an opaque blob is an integrity-of-review concern (A08 adjacent); the whole diff was swept and is clean.
- **Two PRE-EXISTING NUL bytes found in shipped modules and removed** (ticket F). `memory-index/index-io.mjs` (landed `be48ab9`) and `document/document-gate.mjs` (landed `e7d95af`) each used a raw NUL as a glob-expansion sentinel — a deliberate idiom, invisible in an editor, that had already shipped. Both modules were therefore binary to `git diff` at the moment they landed, so their own review saw `Binary files differ` rather than code. Replaced with a single-pass alternation needing no sentinel; equivalence asserted over 16 globs before writing. Now gated by `tests/control-bytes.test.mjs`, which scans every tracked text file and excludes `docs/archive/**` because archived bundles are immutable records.
- **Intermittent suite failure, unresolved and pre-existing.** Twice during this cycle the full suite reported 3 failures, always the same audit-spawning tests (`article-ii-advisory-subagents`, `epic-close governance`, `the baseline audit stays green after the batch`), each passing in isolation and on re-run. Eight concurrent `audit.mjs` invocations did not reproduce it. It occurred before any change in this batch, so it is not attributable to this work — but it is a real CI risk and is recorded here rather than left as folklore.

