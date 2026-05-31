# Security reports — changelog-classify-from-entries

## changelog-classify-from-entries-2026-06-01.md

# Security Review — changelog-classify-from-entries — 2026-06-01

## Summary

Risk: **LOW** (no findings). WF-4b switches the changelog actuator's active mode
from git-log derivation to a caller-supplied `--entries-file` (a local JSON path),
adds a validation helper, and updates the SKILL.md SOP + three `.sh` tests. No new
external input, no shell, no network, no new dependencies; preview mode (the only
semantic-release path) is unchanged.

## Findings

None. What was checked:

- **A03 Injection** — `readEntriesFile` does `JSON.parse` + strict validation
  (section ∈ keepachangelog set, body non-empty string) and throws before any
  write on invalid input. Entry bodies are rendered as Markdown bullets under
  `[Unreleased]` exactly as before (unchanged code path); the changelog is a
  local, project-owned file, not a trust boundary. No new injection surface.
- **A01 / path traversal** — `--entries-file` is resolved via
  `resolve(projectRoot, entriesFile)`. The path is supplied by the **caller**
  (main context / the changelog SKILL.md SOP writes it to
  `.claude/state/changelog/<slug>.entries.json`), not by an external/remote actor.
  The actuator only ever reads that path and writes the project's own
  `CHANGELOG.md` (path unchanged from before). No new traversal exposure.
- **A08 Data integrity** — the consent gate is preserved: `checkConsent` runs
  before any write; `consent-expired_test.sh` confirms a stale token blocks the
  write. Active mode now exits 1 (no write) when `--entries-file` is absent or
  malformed, so a bad invocation cannot half-write the changelog.
- **Secrets** — none touched. **Deps** — none added.

## Dependencies

No `package.json` change.

## Out of scope / Noted

- The actuator no longer calls semantic-release in active mode (only `--preview-only`
  does), which slightly *reduces* the active-mode attack surface (no git/subprocess
  fan-out during the gated write).

