# Security reports — changelog-actuator-staged-diff

## changelog-actuator-staged-diff-2026-05-31.md

# Security Review — changelog-actuator-staged-diff — 2026-05-31

## Summary

Risk: **LOW** (no findings). The change is a surgical correctness fix to a local-file writer: the `[Unreleased]` body-boundary regex in `unreleased-writer.mjs` is broadened from level-2-only (`/\n## [^\n]+\n/`) to level-1-or-2 (`/\n#{1,2} [^\n]+\n/`), plus a one-time content merge of the project-owned `CHANGELOG.md` and a new unit test. No trust boundary, no external/tainted input, no shell, no network, no new dependencies.

## Findings

None. What was checked:

- **A03 Injection / ReDoS** — the broadened pattern `/\n#{1,2} [^\n]+\n/` adds a bounded quantifier (`#{1,2}`, max 2) and reuses the existing linear `[^\n]+` character-class repetition. No nested/overlapping quantifiers, so no catastrophic backtracking (ReDoS). The regex matches headings in a Markdown file the project owns; there is no attacker-controlled input on this path. No change to injection surface.
- **A01 Broken Access Control / path traversal** — `appendUnderUnreleased(changelogPath, entries)` still derives `changelogPath` from `join(projectRoot, 'CHANGELOG.md')` in `changelog.mjs` (unchanged). The writer writes only the path it is handed; the diff does not add any path construction from external input. No traversal introduced.
- **A08 Data Integrity** — the regex fix *reduces* a data-integrity defect (it stops `appendUnderUnreleased` from deleting level-1 released version blocks). The one-time `CHANGELOG.md` merge is content-only, verified lossless at write time (103 merged items = 11 + 92, 0 dropped; all 14 version blocks preserved; exactly one `## [Unreleased]` and one `# Changelog`).
- **Secrets** — no tokens/keys/.env touched.
- **Entry-body interpolation** — `renderUnreleasedBody` interpolates `item.body` into `- ${body}` (pre-existing, unchanged by this diff). Entry bodies originate from the actuator's own classification, not from an external request; Markdown content in a local changelog is not a security trust boundary.

## Dependencies

None added. No `package.json` change.

## Out of scope / Noted

- Defect 2 (classify-from-staged vs HEAD/git-log) is deferred to a follow-up WF-4b; it is a correctness/contract concern, not a security one.

