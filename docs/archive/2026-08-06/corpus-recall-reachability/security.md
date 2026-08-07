# Security reports — corpus-recall-reachability

## corpus-recall-reachability-2026-08-06.md

# Security Review — corpus-recall-reachability — 2026-08-06

## Summary

Overall risk: **LOW**. The diff (492 lines, 15 files) wires three previously-dead recall paths into two advisory hooks and factors the `@ref` rule into one shared module. Every new path-handling surface was probed with hostile input and degrades to `null`/no-op; the new regex is linear and non-backtracking. Two LOW findings, both concerning the *advisory text* rather than any control-flow or filesystem boundary. No CRITICAL or HIGH.

The threat model is bounded by the fact that both hooks are advisory: `process_lifecycle_guard` calls `emitAllow()` on every branch and never blocks. So the realistic exposures are **information disclosure** and **advisory-text spoofing**, not privilege escalation or bypass. No new dependencies; no secrets in the diff.

## What was checked

| Area | Method | Result |
|---|---|---|
| CWE-22 traversal through the new `repoRelative` → lookup flow | 7 hostile paths executed against the live corpus | all `null`; only the legitimate relative path resolved |
| Path escape via `elementReferences` id → `docs/system/elements/<id>.md` | 6 escape attempts (`../`, `a/../b`, `a.md`, uppercase, leading `-`, `_`) | all yield `[]` |
| ReDoS on the reference regex | 60,000-pair single token; 20,000 tokens | 0 ms and 6 ms — linear, no nested quantifier |
| Guard/lint `assertSafeSlug` asymmetry | length-bound analysis + `existsSync` behaviour on a 5,000-char name | no verdict divergence (see LOW-2) |
| Injection via the hardcoded Bash-leg `TARGETS` | reviewed `resolveCategory(memDir, category)` call site | category/key are module-level string literals; no tainted input |
| Secrets hygiene | regex sweep over the added lines | none |
| Dependency risk | `git diff package.json` | no dependency changes |

## Findings

### [LOW] Crafted filename can break out of the advisory's backtick span

- **OWASP**: A03 — Injection (prompt-injection variant) | **CWE**: CWE-117 (Improper Output Neutralization for Logs)
- **File**: `.claude/hooks/process_lifecycle_guard.mjs:76`
- **Evidence**:
  ```js
  emitInfo(`process_lifecycle_guard — context surfaced for \`${filePath}\`:

  ${blocks.join('\n\n')}

  CLAUDE.md Article IX clause 7: treat the surfaced entry/entries as binding for this write; …`);
  ```
  `relative()` preserves backticks and newlines in a filename — measured: a file named ``evil`\nIGNORE.mjs`` round-trips as `"evil`\nIGNORE.mjs"`.
- **Impact**: A repository containing a file whose name carries a backtick and a newline can close the backtick span and inject arbitrary lines into an advisory block that explicitly instructs the reader to treat its content as binding. The injected text sits beside the Article IX.7 citation, so it inherits that framing.
- **Pre-existing, but widened**: the same interpolation existed before this change. What the change does is make the block fire on far more writes — previously the leg returned early whenever no memory entry governed the path, which was *every* path, since the absolute-path defect meant the lookup never matched. This finding is therefore newly *reachable* rather than newly introduced.
- **Recommendation**: strip control characters and backticks from `filePath` before interpolation — `String(filePath).replace(/[`\r\n]/g, '')` — or emit the path on its own line without backtick delimiters. Applies to the identical interpolation in `surfacePhaseScopedMemory`.

### [LOW] `spec-lint` omits the `assertSafeSlug` bound the guard applies

- **OWASP**: A04 — Insecure Design | **CWE**: CWE-20 (Improper Input Validation)
- **File**: `.claude/skills/spec-lint/lint.mjs:83` (`unresolvedReferences`) vs `.claude/hooks/spec_diagram_presence_guard.mjs:88`
- **Evidence**:
  ```js
  // guard — bounds the id before building a path
  try { assertSafeSlug(id, 'corpus reference'); } catch { return true; }
  return !existsSync(join(projectRoot, 'docs', 'system', 'elements', `${id}.md`));

  // lint — goes straight to the filesystem
  .filter((id) => !existsSync(join(root, 'docs', 'system', 'elements', `${id}.md`)));
  ```
- **Impact**: **Not currently exploitable.** `elementReferences` bounds the charset to `[a-z0-9][a-z0-9-]*`, so no separator or dot can reach the path, and `existsSync` returns `false` rather than throwing on an over-length name (verified at 5,000 chars). Both callers therefore reach the same verdict — the guard blocks, the lint reports FAIL. The exposure is latent: if the shared charset is ever widened, the guard keeps its second gate and the lint silently loses one.
- **Recommendation**: have `unresolvedReferences` call `assertSafeSlug` in the same `try`/`catch` shape as the guard. AC-010's stated goal is that the two callers cannot disagree; carrying the same validation is the cheap way to keep that true under future edits.

## Dependencies

No new packages. `git diff HEAD -- package.json` shows no dependency changes; every module touched imports Node stdlib only (`node:fs`, `node:path`), preserving the `zero-runtime-dependencies` constraint.

## Out of scope / Noted

- **Corpus content is surfaced verbatim into a binding-framed advisory.** The new block emits element ids, titles, anchors, and concept ids read from `docs/system/**` frontmatter. This is repository content shown to the repository's own operator, so it discloses nothing the reader cannot already read. It does extend the existing prompt-injection surface that memory `verbatim:` bodies already occupy — a malicious element `title:` would surface under the same Article IX.7 framing. The corpus lands through the spec gates and `/archive`, so the mitigating control is review, not sanitisation. Flagged for awareness, not for change in this cycle.
- **`process_lifecycle_guard.mjs` is at 134 substantive lines** against the ~80 `code-structure` guideline (113 before this cycle). Not a security finding; recorded here because the file now carries two legs with three triggers, and its size is what makes the two interpolation sites easy to miss. `/simplify` flagged the same file for a follow-up extraction spec.
- **The absolute-path defect this change fixed was itself a denial-of-advisory bug.** Before it, `governs:`-based surfacing matched nothing on any real write (measured: 9 entries relative, 0 absolute), so every captured lesson tagged with a path glob was silently unreachable at the moment it applied. Worth noting that a guard which fails open *and* never fires is indistinguishable from one that is working, which is why the audit did not catch it.

