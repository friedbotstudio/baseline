# Security reports — checker-fanout-live-wiring

## checker-fanout-live-wiring-2026-06-22.md

# Security Review — checker-fanout-live-wiring — 2026-06-22

## Summary
Overall risk: **LOW**. The change adds a read-only, fail-open checker fan-out runner plus a config flag. No secrets, cryptography, authentication, network egress, or new dependencies are introduced. The runner writes nothing — it reads two markdown artifacts, runs deterministic pure oracles, and prints a merged verdict. One LOW (theoretical) path-handling note, consistent with the existing trusted-slug threat model.

## Findings

### [LOW] Slug flows into a file path without traversal sanitization
- **OWASP**: A01 - Broken Access Control (path traversal) | **CWE**: CWE-22
- **File**: `.claude/skills/harness/checker-fanout.mjs:62-66` (CLI slug → `join(rootDir, \`docs/specs/${slug}.md\`)`)
- **Evidence**:
  ```js
  const [cmd, slug] = process.argv.slice(2);
  // ...
  specContent: reader(join(rootDir, `docs/specs/${slug}.md`)),
  intakeContent: readOptional(reader, join(rootDir, `docs/intake/${slug}.md`)),
  ```
- **Impact**: A slug like `../../../../etc/passwd` would make the runner *read* an arbitrary file and emit its content into the oracle pipeline (and, on a parse, into stdout). Bounded by: the tool is **read-only** (no write/exec), local-dev only (no network boundary), and the slug is **trusted workflow state** produced by `/triage`, not external input. The slug already flows unsanitized into every other harness path (`workflow.json`, `tdd/<slug>.json`, `drift/<slug>.md`), so this introduces no new trust boundary.
- **Recommendation**: Accept as LOW under the existing trusted-slug model. If a future change ever sources the slug from untrusted input, add a `^[a-z0-9-]+$` slug guard at the harness boundary (one place, covering all consumers) rather than per-runner.

## Dependencies
None added. The runner imports only Node stdlib (`node:fs`, `node:path`, `node:url`) and two existing in-repo oracle modules.

## Out of scope / Noted
- **Fail-open design reviewed — correctly scoped (A04 Insecure Design): no BLOCKER is hidden.** The fail-open paths (`enabled:false`, missing spec, JSON/IO error) return a `{skipped:true}` marker so the harness falls back to the **existing per-skill spec review** — the fan-out is an optimization layer, not a replacement that removes blocking. A genuine oracle BLOCKER (when the runner succeeds) produces verdict `BLOCKED`, CLI exit 2, surfaced to the user before `approve-spec`. Errors degrade to skip; *findings* are never swallowed. This is distinct from the `verify_pass_guard` PASS-when-FAIL failure mode the backlog warns about.
- `JSON.parse` of `project.json` is wrapped (`loadFlag` try/catch → `{enabled:false}`), so a corrupt config disables the feature rather than crashing the harness — fail-safe.
- CLI arg handling requires `cmd === 'run' && slug`; otherwise it prints usage and exits 1. No injection surface (args are not shelled out).

## Checked, no finding
A02 crypto (none), A03 injection (no shell/SQL/eval; `process.argv` not interpolated into a command), A05 misconfig (additive flag, default-on, fail-open), A06 deps (none added), A07/A08 authn/integrity (read-only tool, no tokens), A09 logging (stdout only, no secrets), A10 SSRF (no network).

