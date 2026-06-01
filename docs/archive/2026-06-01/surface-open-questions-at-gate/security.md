# Security reports — surface-open-questions-at-gate

## surface-open-questions-at-gate-2026-06-01.md

# Security Review — main (surface-open-questions-at-gate) — 2026-06-01

## Summary
Risk: **LOW**. The diff adds a read-only markdown consolidator CLI
(`.claude/skills/harness/consolidate-open-questions.mjs`) invoked by the harness at
the `/approve-spec` yield. One LOW path-traversal finding (`--slug` is not format-
validated at the CLI boundary) is fixed in-loop. The parsing regexes are linear (no
ReDoS), no secrets, no new dependencies, no crypto.

## Findings

### [LOW] Path traversal via unvalidated `--slug` (info disclosure)
- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/harness/consolidate-open-questions.mjs` — `readArtifact()` (`join(dir, 'docs', sub, \`${slug}.md\`)`) reached from `main()`.
- **Evidence**:
  ```js
  function readArtifact(dir, sub, slug) {
    try {
      return readFileSync(join(dir, 'docs', sub, `${slug}.md`), 'utf8');
    } catch { return null; }
  }
  ```
- **Reachability** (confirmed): `node consolidate-open-questions.mjs --slug "../../secret" --dir <root>` resolves `<root>/docs/intake/../../secret.md` → `<root>/secret.md`, and the helper echoes that file's `## Open questions` bullets to stdout:
  ```
  ### Open questions to resolve before approving `../../secret` (1)
  - [spec, research, intake] LEAKED SECRET LINE
  ```
- **Impact**: Limited information disclosure — only content under a `## Open questions` heading of a `.md`-suffixed file is rendered. In the normal flow the slug originates from `workflow.json` and is validated upstream by `seed-tasklist.mjs` against `^[a-z0-9][a-z0-9-]*$` (CWE-78/22 hardening already shipped), so the practical attacker must control `workflow.json` (operator) or invoke the CLI directly. No write, no code execution.
- **Recommendation** (applied in-loop): validate `slug` at the CLI boundary against the same `^[a-z0-9][a-z0-9-]*$` pattern the rest of the harness uses; reject with stderr + exit 2 on mismatch. This is defense-in-depth that makes the helper safe to invoke independently of upstream validation.

## Resolution (applied in-loop, same workflow)
`main()` now rejects any `--slug` that does not match `^[a-z0-9][a-z0-9-]*$` (exit 2),
mirroring `seed-tasklist.mjs`. Regression guard
`test_when_slug_has_path_traversal_then_rejected` asserts `--slug ../../secret` exits
non-zero and emits no file content. Finding **CLOSED**.

## Dependencies
No new packages. Uses only Node stdlib (`node:fs`, `node:path`, `node:url`, `node:util`).
`npm audit` not re-run (no dependency delta).

## Out of scope / Noted
- **Parsing regexes — checked clean (no ReDoS).** `OPEN_QUESTIONS_HEADING`,
  `SECTION_HEADING`, `BULLET`, `NONE_PLACEHOLDER`, and the two `normalizeQuestion`
  replaces all run per-line (input is `split(/\r?\n/)` first) and contain no nested
  quantifiers; measured 0.24 ms on a 100 KB single line.
- **Unbounded read.** `readFileSync` loads each artifact whole; bounded in practice by
  trusted local `docs/**` markdown (KB-scale). Not exploitable beyond the traversal
  case above, which the slug guard now blocks. No size cap added (YAGNI for trusted
  local docs).
- **Output is stdout only** and consumed into a human-facing yield message; no shell
  interpolation, no file write, no eval of artifact content.

