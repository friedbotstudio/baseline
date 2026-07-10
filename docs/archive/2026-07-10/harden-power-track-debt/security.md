# Security reports — harden-power-track-debt

## harden-power-track-debt-2026-07-10.md

# Security Review — harden-power-track-debt — 2026-07-10

## Summary

Overall risk: **LOW**. This is the first **power-track per-ticket** security review — three tickets reviewed independently (T1, T2, T3), each with its own verdict below. T1 touches consent machinery (gate-A approval integrity); its content-hash check was probed for bypass and fail-open and is sound — it is purely additive to the forge-proof marker handshake, hashes the whole spec bytes, and every malformed or pre-feature token input resolves to a re-yield (never a silent pass). T2 and T3 introduce no new attack surface. No third-party dependency is added (node:crypto stdlib only). No CRITICAL or HIGH findings.

## power_batch_reviews (per-ticket verdicts)

| Ticket | Surface | Verdict | Note |
|---|---|---|---|
| **T1** — gate-A content hash | consent machinery (`.claude/hooks/lib/`, sensitive glob; ships to consumers) | **LOW** | Consent integrity confirmed sound; one defense-in-depth note (below). No bypass, no fail-open. |
| **T2** — drift-reverify dual-arg | tdd tooling | **CLEAN** | The arg-parse change does not touch the `fpPath` construction; no new path-traversal surface. Pre-existing unsanitized slug is dev-controlled and unchanged. |
| **T3** — docsite completeness test | test only | **CLEAN** | Test file; node stdlib + one in-repo import; no runtime code, no network, no new dependency. Nil surface. |

No ticket raised a BLOCKER; the batch proceeds.

## Findings

### [LOW] `compareSpecHash` propagates a throw on a malformed `specBytes` argument

- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-248 (Uncaught Exception) — defense-in-depth
- **File**: `.claude/hooks/lib/spec-content-hash.mjs:25-30`
- **Evidence**:
  ```js
  export function compareSpecHash(tokenHash, specBytes) {
    if (typeof tokenHash !== 'string') return false;
    const recorded = tokenHash.trim();
    if (recorded === '' || recorded === 'N/A') return false;
    return recorded === computeSpecContentHash(specBytes); // throws if specBytes is not string/Buffer
  }
  ```
- **Impact**: `compareSpecHash` guards `tokenHash` (returns `false` on any malformed value) but passes `specBytes` straight to `computeSpecContentHash`, which throws on a non-string/Buffer. In the harness resume the caller always supplies `fs.readFileSync(spec)` (a Buffer), so this cannot arise in practice — **not exploitable**. The concern is directional: a throw propagating out of the resume check is a *fail-closed* outcome (the harness errors and does not proceed past gate A), but it is an ungraceful one. A hardened version would fail *toward re-yield* explicitly.
- **Recommendation**: guard `specBytes` symmetrically — `if (typeof specBytes !== 'string' && !Buffer.isBuffer(specBytes)) return false;` before the compare. One line; makes the fail-safe direction explicit rather than incidental. Suitable as a fast-follow; does not block this landing.

## Threat questions — answered

**T1 — gate-A content hash (the ticket that matters):**
1. **Bypass — can an amended spec pass gate A?** No. `compareSpecHash` returns `true` only when `tokenHash === computeSpecContentHash(specBytes)`. Making that wrongly-true requires a sha256 second-preimage (infeasible). Probed empirically: `''`, `'N/A'`, `'  '`, `null`, `undefined`, `42`, and a wrong hex hash all return `false`. An amended spec produces a different hash → mismatch → re-yield.
2. **Does it weaken the forge-proof marker handshake?** No — purely additive. The `consent_gate_grant` UserPromptSubmit marker and `spec_approval_guard` are untouched (spec Non-goal). The content hash is a *second* check layered on top of, not in place of, the structural marker gate.
3. **Fail-open on adversarial input?** No. `computeSpecContentHash` hashes the whole bytes and throws on non-string/Buffer; `compareSpecHash` fail-safes to `false` on every malformed `tokenHash`. The only unguarded path (`specBytes`) is the LOW finding above, and it fails *closed* (throw → no proceed), not open.
4. **Whole-bytes coverage?** Confirmed — `createHash('sha256').update(bytes).digest('hex')` over the entire spec bytes; no truncation for an attacker to pad around.
5. **Pre-feature token safety (regression check).** A token whose line 5 is absent or `N/A` (predating this feature) resolves `false` → re-yield. A stale token can never silently satisfy the new check. Confirmed empirically.

**T2 — drift-reverify dual-arg:**
- The change is `const [sub, slug] = argv` → `sub = argv[0]; slug = argv[1] === '--slug' ? argv[2] : argv[1]`. It parses the slug; it does **not** touch `fpPath = path.join(stateDir, \`${slug}.driftfp\`)`. So the (pre-existing, unchanged) fact that `slug` is not path-sanitized is neither introduced nor worsened by T2. `slug` is developer-controlled — derived by `/triage` and written to `workflow.json` — so a traversal slug like `../../x` is not attacker-reachable. **Noted for later** (defense-in-depth), out of scope for this ticket which only aligned the arg parser to its docs.

**T3 — docsite completeness test:**
- `tests/docsite-predicate-table-completeness.test.mjs` imports `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`, and dynamically imports the in-repo `src/cli/workflows-validator-predicates.js`. No network, no `child_process`, no third-party dependency, reads only in-repo files. No runtime code ships. Nil surface.

## Dependencies

**None added.** T1's helper uses `node:crypto` (stdlib); T2 uses no new import; T3 uses `node:*` stdlib + one in-repo import. No lockfile change, no CVE surface.

## Out of scope / Noted

- **New shipped file under a sensitive glob.** `.claude/hooks/lib/spec-content-hash.mjs` matches `security.sensitive_globs` (`.claude/hooks/**`) and ships to consumers via the manifest. Reviewed as a supply-chain artifact: it is pure, stdlib-only, performs no IO, no network, no `eval`/dynamic dispatch. Safe to ship.
- **Pre-existing unsanitized slug → filename** in `drift-reverify-guard.mjs` and its sibling `simplify/reverify-guard.mjs` (`${slug}.driftfp` / `${slug}.fp`). Dev-controlled today; a defense-in-depth slug-sanitization (matching the durable-plan slug hardening already in the repo's security history) would harden these state-file writers if the slug ever became less trusted. Not introduced by this batch.

