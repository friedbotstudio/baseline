# Security reports — swarm-first-run-hardening

## swarm-first-run-hardening-2026-06-22.md

# Security Review — swarm-first-run-hardening — 2026-06-22

## Summary

Overall risk: **LOW**. The diff adds three dev-time `.mjs` helpers, a two-line schema-validator addition, an additive lint export, and SKILL.md prose. No network surface, no secrets, no crypto, no auth, no new dependencies. Every input is developer/local-controlled (worker output from our own `swarm-worker` subagents; locally-authored spec/plan/`active_wave.json` files). `git` is always invoked via `spawnSync` with an args array (never a shell string), so there is no command-injection surface. No CRITICAL/HIGH/MEDIUM findings; three LOW notes below.

## Findings

### [LOW] JSON.parse over each non-empty line of worker text (bounded)
- **OWASP**: A03 - Injection (parsing) | **CWE**: CWE-400 (uncontrolled resource consumption, theoretical)
- **File**: `.claude/skills/swarm-dispatch/parse_worker_result.mjs:31-48`
- **Evidence**:
  ```
  for (let i = nonEmpty.length - 1; i >= 0; i--) {
    const obj = tryParseStatusObject(nonEmpty[i]);
    if (obj) { lastJsonIdx = i; parsed = obj; break; }
  }
  ```
- **Impact**: A pathologically large worker message means O(n) `JSON.parse` attempts. The input is our own subagent's final message (not an external attacker), and the scan short-circuits on the first parseable line from the bottom, so cost is bounded in practice. `JSON.parse` does not `eval`; a `{"__proto__":…}` payload does not pollute the prototype via plain parse, and only `task_id`/`status` are read off the result (never merged into another object).
- **Recommendation**: None required. If ever fed truly untrusted multi-MB input, cap scanned-line count — not warranted for dev-time worker output.

### [LOW] Contracts-section regex uses lazy `[\s\S]*?` with lookahead
- **OWASP**: A03 - Injection (ReDoS class) | **CWE**: CWE-1333
- **File**: `.claude/skills/spec-lint/lint.mjs` (`checkApiSurfacePinned`)
- **Evidence**:
  ```
  const m = content.match(/^#{2,3}\s+Contracts\s*$([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im);
  ```
- **Impact**: Lazy quantifier + lookahead can be slow on adversarial input. Input is a locally-authored spec file the developer controls, not an attacker channel, so there is no realistic DoS vector. `/^\s*Component\(/gm` is linear.
- **Recommendation**: None required (dev-controlled input). The pattern is anchored and bounded by document size.

### [LOW] D2 audit trusts `active_wave.json` integrity
- **OWASP**: A08 - Software & Data Integrity | **CWE**: CWE-345
- **File**: `.claude/skills/swarm-dispatch/swarm_wave_audit.mjs` (`unionFromActiveWave`, `pre_wave_changed`)
- **Impact**: The post-wave audit derives its union write_set and pre-wave baseline from `.claude/state/swarm/active_wave.json`, written by the orchestrator. A tampered control file could weaken the audit. This is local orchestration state under the same trust domain as the dispatcher — not an external boundary. The audit is itself a defense-in-depth layer (it strengthens, never weakens, the prior posture).
- **Recommendation**: None required. The control file is written and read by the same trusted dispatcher within one workflow.

## Dependencies

No new packages. Helpers use only Node stdlib (`node:fs`, `node:path`, `node:child_process`, `node:url`). `npm audit` / `pip-audit` not applicable to this diff (no manifest change).

## Out of scope / Noted

- `git` invocations use `spawnSync('git', [args], …)` (array form, no `shell:true`) in `swarm_wave_audit.mjs` and the existing `swarm_merge.mjs` — confirmed no shell-injection surface.
- The D1 `worktree-safety.mjs` is a pure policy function (no I/O, no parsing) — no security surface.
- Path traversal: `swarm_wave_audit` does set-membership comparison of porcelain paths against the declared write_set; a crafted path that doesn't match simply gets *flagged* as a violation (fail-loud), so unusual paths make the audit stricter, not weaker.

