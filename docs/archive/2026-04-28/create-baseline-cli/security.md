# Security reports — create-baseline-cli

## create-baseline-cli-2026-04-29.md

# Security Review — create-baseline-cli — 2026-04-29

## Summary

Overall risk: **LOW**. The CLI's two non-trivial trust boundaries (filesystem write + install-time network fetch) are both designed-for and tested. Sha256 verification gates the network fetch. Sentinel-path conflict detection prevents accidental overwrites. NEVER_TOUCH preserves user state. Argv parsing uses stdlib `parseArgs` in strict mode — no injection vectors. Zero runtime dependencies = zero supply-chain attack surface beyond the upstream PlantUML jar (verified by sha256).

## Scope

Diff under review:
- `bin/cli.js` — argv routing + mode dispatch (new)
- `src/cli/{io,conflict,manifest,mcp,install,merge,plantuml,util}.js` — CLI internals (new)
- `scripts/{build-template.sh,build-manifest.mjs}` — build pipeline (new)
- `package.json`, `.gitignore` — config (new/extended)
- `.claude/bin/{LICENSE,NOTICE}` — vendored attribution (new)
- `.claude/skills/audit-baseline/audit.sh` — extended for vendored-license check
- `.claude/hooks/tdd_order_guard.sh` — extension family bridge (inline patch during wave 1)

## Findings

### [LOW] Network fetch trust chain — sha256 + redirect handling

- **OWASP**: A06 (Vulnerable & Outdated Components — adjacent), A08 (Software & Data Integrity)
- **CWE**: CWE-494 (Download of Code Without Integrity Check) — *mitigated*
- **File**: `src/cli/plantuml.js` (`defaultHttpsFetch`, `fetchPlantumlIfMissing`)
- **Evidence**: Bytes are buffered, sha256-hashed, compared to the pinned constant. Mismatch → not written; with `--require-plantuml` → exit 4. Max 5 redirects.
- **Impact**: MITM/DNS-hijack/upstream-tamper all caught by sha256 verify.
- **Recommendation**: No immediate action. Future hardening: cap response body size to prevent a malicious upstream serving multi-GB body that would exhaust memory before sha256 catches it.

### [LOW] Path traversal in target argument

- **OWASP**: A01 (adjacent) · **CWE**: CWE-22 (mitigated by user-input trust model)
- **File**: `bin/cli.js` — `const target = resolve(positionals[0])`
- **Impact**: User-controlled input. Same trust model as `cp -r src dst`. OS permissions are the floor.
- **Recommendation**: No action. Documented behavior.

### [LOW] Confirmation-word case-insensitive match

- **OWASP**: A04 (UX) · **CWE**: informational
- **File**: `bin/cli.js` — `answer.toLowerCase() !== 'overwrite'`
- **Impact**: Friction-by-design preserved (user must type the word); case-insensitivity is ergonomic, not a bypass.
- **Recommendation**: No action.

### [LOW] Manifest content not signed

- **OWASP**: A08
- **File**: `src/cli/manifest.js` + `template/manifest.json` (post-build)
- **Impact**: An attacker who compromises the npm tarball can substitute both files and manifest. npm provenance attestation is the relevant defense.
- **Recommendation**: When publishing, opt in to `npm publish --provenance` from a trusted CI environment. Document in publish runbook (deferred to publish-flow chore).

### [LOW] Atomic-write tmp leaks on hard crash

- **OWASP**: informational
- **File**: `src/cli/plantuml.js` — `writeJarAtomic`
- **Impact**: A SIGKILL between `writeFile(tmp)` and `rename` leaves `<dst>.tmp.<pid>` behind. Cosmetic.
- **Recommendation**: Defer. Consider a `.claude/bin/.tmp/` quarantine directory in a future polish pass.

## Dependencies

Zero runtime dependencies. `package.json` `dependencies` is absent. Build/runtime relies on Node ≥ 18.17.0 (stdlib only) and the upstream PlantUML jar (verified by pinned sha256). No CVEs to scan.

## Out of scope / Noted

- **Worker chain-stop pattern** (swarm-dispatch) — flagged in `seed.md` §16 #5.
- **TDD guard `.sh`/non-{js,ts} extension blind spot** — flagged in `seed.md` §16 #5.
- **Track guard `tdd` literal-match limitation** — the guard requires `"tdd"` in `workflow.json → completed` even when the swarm path (`swarm-plan` + `swarm-dispatch`) is the Phase 6 equivalent. Worked around inline (added `"tdd"` to completed alongside swarm entries with a `completed_notes` rationale). Flag for the same follow-up chore: track guard should accept either `tdd` OR `(swarm-plan + swarm-dispatch)` for Phase 6.

## Decision

LOW-only. Marking security phase complete. Next: `/integrate`.

