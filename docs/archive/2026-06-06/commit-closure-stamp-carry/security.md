# Security reports — commit-closure-stamp-carry

## commit-closure-stamp-carry-2026-06-06.md

# Security Review — commit-closure-stamp-carry — 2026-06-06

## Summary

Overall risk: **LOW**. The change adds a hard-block leg to `git_commit_guard` (a security-critical consent guard), a pure Foundation lib, and a read-only CLI preflight. The adversarial focus was the guard's fail-open behavior and consent-bypass surface. The one structural risk — a missing shipped dependency making the guard fail open in consumer installs — is verified mitigated. No CRITICAL/HIGH findings.

## What was checked (enumerated)

- **A01 Broken Access Control (the guard is itself an access control).** The closure leg can only *add* a block (`emitBlock` on an unsatisfied closing commit) or *fall through* (`block:false`) to the existing branch/consent policy. There is **no path where the closure leg removes or skips a consent check** — verified by control-flow inspection (`handleBash`: closure leg sits after `isInsideWorkTree()`, before `branchPolicy()`; a `block:false` result proceeds to the unchanged consent/branch checks) and by the full existing guard suite (branch-aware + topology, 853/0) passing unchanged.
- **Fail-open on crash (the load-bearing risk).** `main().catch → emitAllow` means any throw in the guard fails *open* (allows the commit, bypassing consent + forbidden-flags). A missing import would crash every guard run → consent bypass (the v0.8.1 marker-import bug class). **Verified mitigated:** `.claude/hooks/lib/closure-check.mjs` is present in `obj/template/.claude/manifest.json`, shipped to `obj/template/.claude/hooks/lib/`, and the shipped guard's `import` resolves. `audit-baseline` re-hashes the manifest, so drift is caught in CI.
- **Fail-safe degradation on git error.** `gitCapture` catches all errors and returns `null`; `evaluateClosure` treats a null staged-names read as "no obligation" (`block:false`), so a git failure in the closure leg **skips the closure check but still enforces consent** — it does not fail the whole guard open. (Only a module-level crash hits the fail-open `catch`, and that's the shipped-dependency concern above.)
- **A03 Injection / ReDoS.** The CLI helper (`closure-precommit-check.mjs`) reads inputs via `readFileSync` + `parseArgs` (`strict:true`, `allowPositionals:false`) — no shell, no `eval`. Both regexes are linear: `CLOSES_RE` uses `[a-z0-9-]*` (single, non-nested quantifier) and the lib's stamp matchers use `\s*` — no catastrophic backtracking.
- **A08 Software & Data Integrity.** The feature's purpose is integrity: it makes the backlog-closure record's arrival in git history atomic with the commit that claims it. The shipped-payload check confirms the control travels to consumers (not just the dev tree).
- **D2 attack-surface decision (verified honored).** Message-dependent `Closes <key>` reconciliation is in the SOP preflight, **not** the hard-block guard — the guard reads only the staged index (`git diff --cached --name-only`, `git show :<path>`). This deliberately keeps the quoting-blind message-parsing surface (the `git-commit-guard-tokenize` landmine) out of the hard-block path. Confirmed: no message string is parsed anywhere in `git_commit_guard.mjs`'s closure leg.
- **Secrets hygiene.** No tokens/keys/secrets added; no `.env` access.
- **Dependencies.** No new packages — `closure-check.mjs` and `closure-precommit-check.mjs` use only node builtins (`node:fs`, `node:util`, `node:child_process`). `npm audit` surface is unchanged by this diff.

## Findings

### [LOW] Fail-open guard depends on a shipped sibling module (defense-in-depth note)
- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-829 (Inclusion of Functionality from Untrusted/Absent Control Sphere)
- **File**: `.claude/hooks/git_commit_guard.mjs` (import of `./lib/closure-check.mjs`)
- **Evidence**:
  ```js
  import { evaluateClosure } from './lib/closure-check.mjs';
  // ... main().catch((err) => { ...; emitAllow(); })  // fail-open on any throw
  ```
- **Impact**: If `closure-check.mjs` were ever dropped from the shipped manifest, the guard would crash at import and fail open — bypassing not just closure but consent and forbidden-flag enforcement, in every consumer install.
- **Recommendation**: Already mitigated structurally (manifest + `audit-baseline` hash check + the new `closure-amendment-governance` test). No code change required. Noted so the coupling is explicit: any future guard refactor must keep the lib shipped. Accept as LOW.

## Dependencies

No new dependencies introduced by this diff. (The pre-existing `liquidjs` CRITICAL in the eleventy dev toolchain is tracked separately as backlog `bump-eleventy-fix-liquidjs-critical-rce-vuln-8caf` and is unrelated to this change.)

## Out of scope / Noted

- The guard enforces the obligation only when a commit *stages* a closing `workflow.json`; it does not force every commit to stamp backlog. This matches the threat model (preventing accidental stranding per the RCA), not a malicious actor deliberately evading closure — which is out of scope and not a regression (the prior SOP-only design enforced even less).
- Hook-level enforcement (this change) is strictly stronger than the prior SOP-only design: the obligation now binds every `git commit`, not just `/commit` runs.

