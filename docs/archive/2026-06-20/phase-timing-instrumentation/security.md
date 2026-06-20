# Security reports — phase-timing-instrumentation

## phase-timing-instrumentation-2026-06-21.md

# Security Review — phase-timing-instrumentation — 2026-06-21

## Summary

Overall risk: **LOW**. The change adds an observation-only PostToolUse hook (`phase_timer.mjs`) and a Foundation library (`lib/timing.mjs`) that stamps per-phase completion timestamps and renders a duration table. There is no network, shell, `eval`, crypto, auth, or secrets surface, and no new dependencies. One LOW defense-in-depth finding (slug path handling), mitigated by upstream `/triage` slug validation and consistent with existing baseline patterns.

## Findings

### [LOW] `slug` is interpolated into the timing-file path without re-validation
- **OWASP**: A03 — Injection (path) / A04 — Insecure Design | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/hooks/lib/timing.mjs:34` (`timingPath`), `:39` (`approvalTokenPath`), CLI `defaultBundleDir` `:152`
- **Evidence**:
  ```js
  const timingPath = (rootDir, slug) => join(rootDir, '.claude', 'state', 'timing', `${slug}.jsonl`);
  // slug originates from workflow.json (written by /triage) for the hook path,
  // and from argv[3] for `node timing.mjs render <slug>` (archive skill).
  ```
- **Impact**: A `slug` containing `../` segments would resolve the JSONL/`timing.md` write outside `.claude/state/timing/`. Reaching this requires a poisoned `workflow.json → slug` or a hand-invoked `render` with an adversarial argument — both already inside the trust boundary. `/triage` constrains the slug charset before it reaches `workflow.json` (enforced by `tests/atomic-writes-and-slug.test.mjs`, CWE-78), and the render CLI is invoked only by the archive skill with the trusted workflow slug. The hook never reads a slug from any external/tool-supplied field — only `tool_input.file_path` basename, which gates *whether* to stamp, not *where*.
- **Recommendation**: Optional hardening — add a one-line slug guard in `lib/timing.mjs` (`if (!/^[a-z0-9-]+$/.test(slug)) return …`) so the module is safe even if a future caller passes an unvalidated slug. Not required for this change; the existing `harness/<slug>.log` and `archive.sh` paths interpolate the same slug without re-validation, so this is a baseline-wide convention, not a regression introduced here.

## Dependencies

No new packages. The diff imports only Node stdlib (`node:fs`, `node:path`, `node:url`) and the existing internal `lib/common.mjs`. `npm audit` surface unchanged.

## Out of scope / Noted

- **Data integrity of `timing.jsonl` (A08)**: the timing log is observational telemetry with no security role; tampering degrades measurement accuracy only, not any control decision. No finding.
- **`phase_timer.mjs` fail-safe behavior**: confirmed it cannot block a tool call (PostToolUse has no deny path), never writes to the edited file, and returns `{appended:[]}` on malformed/absent `workflow.json` (JSON.parse wrapped in try/catch). This is correct fail-open-for-observation design — a timing-stamp failure must never disturb a workflow.
- **Governance/test diff** (count surfaces, `expected-baseline.mjs`, refactored tests): no executable trust boundary; not security-relevant.

