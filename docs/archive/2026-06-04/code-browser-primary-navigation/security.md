# Security reports — code-browser-primary-navigation

## code-browser-primary-navigation-2026-06-04.md

# Security Review — code-browser-primary-navigation — 2026-06-04

## Summary

Overall risk: **LOW** (no findings). This change is a governance/doctrine edit: the navigation-routing Article X.5 + a binding-preserving CLAUDE.md compression, deframed seed/CONSTITUTION navigation entries, a `code-browser/SKILL.md` rewrite, one node:test artifact-assertion suite, and one static JSON eval fixture. There is no runtime code path, trust boundary, network call, credential, or cryptographic/auth surface introduced or modified.

## Findings

None.

## What was checked (enumerated)

- **A03 Injection / command exec** — the only executable artifact added is `tests/code-browser-primary-navigation.test.mjs`. It performs `readFileSync` + `createHash('sha256')` + asserts; **no** `execSync`/`spawn`/`child_process`/`eval`/`process.env`/`require()` of dynamic input (grep-confirmed). The fixture-validity loop reads `entry.file` from a **checked-in, trusted** fixture (`tests/fixtures/code-browser-nav-eval.json`) joined under `REPO_ROOT` — not attacker-controlled; runs only in CI/dev against the repo's own files.
- **A02/Crypto** — `sha256` is used only as a content-equality regression check on `walk.mjs`/`discover.mjs`; not a security primitive. No new crypto, IVs, or hashing of secrets.
- **Secrets hygiene** — grep for api-key/secret/token/password/private-key patterns in added lines: none (the only `consent`/`grant` tokens are pre-existing governance-prose references, not values).
- **A06 Vulnerable/outdated components** — `package.json` unchanged; **no new dependencies**.
- **A08 Software & data integrity** — the consent-gate / approval-token machinery (the repo's integrity controls) is **not** touched; the CLAUDE.md compression preserved every Article I–XI rule, the §17/Article-XI citations, and the hooks/gates verbatim (preservation test green). `walk.mjs`/`discover.mjs` byte-identical (sha256 regression trap green).
- **A01 Access control / A04 Insecure design / A05 Misconfig / A07 AuthN / A09 Logging / A10 SSRF** — not applicable; no auth, sessions, endpoints, config, or outbound requests in the diff.
- Linters: no `bandit`/`semgrep`/`gosec` configured for a markdown+test diff; `npm audit` not re-run (no dependency change). The full serial suite (790 pass / 0 fail / 7 skipped) and `audit-baseline` (PASS, 0 warns) are green.

## Dependencies

None added.

## Out of scope / Noted

- The doctrine change makes `code-browser` the primary navigation path; it introduces no new capability or privilege — it only re-routes which read-only navigation tool the model reaches for first. No security relevance.

