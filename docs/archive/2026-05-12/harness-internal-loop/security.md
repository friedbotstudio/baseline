# Security reports — harness-internal-loop

## harness-internal-loop-2026-05-13.md

# Security Review — harness-internal-loop — 2026-05-13

## Summary

**Risk: LOW.** This change is a pure markdown SOP rewrite (the harness skill's instructions to the model) plus a constitutional text update plus 4 text-invariant test additions plus a regenerated manifest. Zero new code paths, zero new external input surface, zero new dependencies, zero new auth/secret/crypto handling. No CRITICAL/HIGH/MEDIUM findings. One LOW observation noted below.

## Method

1. **Diff enumeration** (non-git project — enumerated by inspection):
   - `.claude/skills/harness/SKILL.md` — SOP rewrite (markdown, model-facing instructions).
   - `CLAUDE.md` — Article V rewrite (markdown, model-facing constitution).
   - `src/CLAUDE.template.md` — byte-mirror of CLAUDE.md (cp).
   - `docs/init/seed.md` — §7 + §4.1 + §6 text updates (markdown).
   - `tests/harness_continuation.test.mjs` — 4 new text-invariant tests appended (read file → assert regex/equality).
   - `obj/template/.claude/skills/harness/SKILL.md` — synced from the source SOP.
   - `obj/template/manifest.json` — regenerated sha256 table.
2. **Trust boundaries**: none added. The harness skill runs in main context; it does not process untrusted input. The Stop hook (`harness_continuation.sh`) was NOT changed in this workflow.
3. **OWASP Top 10 walk** — A01–A10: none applicable. No HTTP handlers, no auth flows, no crypto, no new dependencies, no new config knobs.
4. **`npm audit --omit=dev`**: `found 0 vulnerabilities`.
5. **Runtime dependencies**: `package.json → dependencies: []` (zero runtime deps). `devDependencies: [@11ty/eleventy, nunjucks]` — unchanged by this diff and not shipped (excluded by `files:`).
6. **Secrets scan**: no `.env`, no API keys, no tokens introduced. The approval token files (`.claude/state/spec_approvals/*.approval`) carry only `APPROVED` / epoch / path / SHA — no secrets.

## Findings

*(none in the Critical / High / Medium tiers.)*

### [LOW] Test file imports `child_process.spawnSync` and runs the hook binary

- **OWASP**: A04 - Insecure Design (best practice — subprocess execution in tests)
- **CWE**: CWE-78 (cousin — command injection at test boundary, not a real exposure here)
- **File**: `tests/harness_continuation.test.mjs:8` (pre-existing import; not new this workflow)
- **Evidence**:
  ```js
  import { spawnSync } from 'node:child_process';
  ...
  function invokeHook(tmp, payload) {
    return spawnSync('bash', [HOOK_PATH], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      input: JSON.stringify(payload),
      ...
  ```
- **Impact**: A test could in theory be tricked into invoking an attacker-controlled `HOOK_PATH` if `__filename` resolution were ever compromised. In practice `HOOK_PATH` is derived from `import.meta.url` at test load; non-exploitable in this codebase.
- **Recommendation**: Out of scope for this workflow — this code is pre-existing and not modified by the diff. The new tests (4 added) do NOT spawn subprocesses; they only read files. No action required.

## Dependencies

No new packages. `package.json` runtime deps remain `[]`. devDependencies unchanged.

## Out of scope / Noted

- The `harness_continuation.sh` hook itself was NOT modified by this workflow (the diagnostic logging added in the debug session is pre-existing relative to this spec's write_set). Any future hook code edits would warrant a fresh security pass on the hook's bash + python3 subprocess surface.
- The constitutional rewrite removes the "exactly one Skill call per tick" language and replaces it with internal-loop semantics. This is a semantic change to model behavior, not a security change — but it does mean the harness now performs more work in a single user-authorized turn. If a future workflow grants `/harness` execution to an untrusted operator, the larger work surface per invocation is worth noting (operator now drives N phases per `/harness`, previously 1). For solo development this is the intended behavior; for shared-operator scenarios, the consent gates (approve-spec, approve-swarm, grant-commit) remain the trust boundaries — those still demand explicit user input.

