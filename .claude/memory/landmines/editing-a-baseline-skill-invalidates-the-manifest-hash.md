---
key: editing-a-baseline-skill-invalidates-the-manifest-hash
category: landmines
scope: [tdd, simplify, integrate, document]
governs: .claude/skills/**
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Trap: editing ANY baseline-owned file under `.claude/skills/**` (including a SKILL.md) invalidates its sha256 in `obj/template/.claude/manifest.json`. `audit-baseline` then fails with `skill ownership: <slug>  FAIL  hash mismatch at <path>`, and because many tests call `runRepoAudit`, one stale hash reads as a broad suite failure.
- Fix: `npm run manifest:refresh`. It rebuilds the template and re-stamps the manifest, writing only gitignored `obj/` — so it expands no committed write set and needs no scope negotiation.
- Hit three times in one workflow (2026-08-13): after the first SKILL.md edit, after a later `gather.mjs` timeout change, and again after a module-header edit. Any edit AFTER a refresh re-stales it, so refresh last, immediately before the verify or audit that must pass.
- Tell: the audit names exactly one FAIL row and it is `hash mismatch`, while every other check passes. That shape means the code is fine and the manifest is behind.
