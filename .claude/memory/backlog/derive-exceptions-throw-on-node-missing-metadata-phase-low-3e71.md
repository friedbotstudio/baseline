---
key: derive-exceptions-throw-on-node-missing-metadata-phase-low-3e71
category: backlog
scope: any
status: open
raised-on: 2026-07-13
raised-in-context: extractor-noise-and-prereq-drift (`/security` T2 LOW)
source: assistant-deferral
estimated-effort: tiny
verified-at: 1414f27
last-touched: 2026-07-13
caveat: full analysis in `docs/security/extractor-noise-and-prereq-drift-2026-07-13.md`.
---

> verbatim (assistant, 2026-07-13, `/security` T2 LOW): "A node missing `metadata.phase` is silently skipped, so its phase is treated as undeclared and therefore unreachable → excepted. Cannot bypass a consent gate (the deny-list still applies), but it can silently skip a non-gate phase."

- Intent: make `deriveExceptions` throw a named error on a track node lacking `metadata.phase`, instead of silently treating it as absent (which over-excepts). The workflows validator already rejects malformed tracks; this would make the two agree.
- Not exploitable: `.claude/workflows.jsonl` is a trusted, in-repo, developer-authored file — not attacker input. Consent gates stay protected by CONSENT_DENY_LIST regardless. Pure robustness.
