# Security reports — remove-python-runtime-dep

## remove-python-runtime-dep-2026-05-28.md

# Security Review — remove-python-runtime-dep — 2026-05-28

## Summary

**Overall risk: LOW.** This workflow ports Python skill helpers to Node ESM and removes 5 `.sh` wrapper scripts in favor of direct `.mjs` invocations. The ports preserve the original security posture — same subprocess argv arrays (no shell interpolation), same operator-trust model on CLI path arguments, same manifest-driven file integrity checks. No new third-party dependencies; pure Node stdlib (`node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:util.parseArgs`). The diff is 56 files / +3478 / -2382, all internal to the baseline tooling. Two LOW advisory findings worth recording for follow-up.

## Findings

### [LOW] LF-1 — `validate.mjs` writes plan JSON non-atomically

- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-362 (Race Condition)
- **File**: `.claude/skills/swarm-plan/validate.mjs:175` (final `writeFileSync(planPath, ...)`).
- **Evidence**:
  ```js
  writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  ```
- **Impact**: A crash, SIGKILL, or power loss between open and fsync leaves a partially-written `plan.json` on disk. The next `/swarm-dispatch` invocation reads the corrupt file and aborts. Same posture as the `.py` original (which used `with open(plan_path, "w") as f: json.dump(plan, f, indent=2)` — also non-atomic). No regression vs. pre-port state; recorded here so it surfaces alongside the prior backlog item `workflow-migrator-write-not-atomic-power-loss-corruption-3e91`.
- **Recommendation**: Write to `planPath + '.tmp'` then atomic `rename` to `planPath`. POSIX rename is atomic on the same filesystem. ~3-line change. Defer to the same follow-up workflow that addresses the parallel landmine in `workflow-migrator.js`.

### [LOW] LF-2 — `swarm_merge.mjs` does not symlink-resolve the worktree path before file operations

- **OWASP**: A04 Insecure Design | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/swarm-dispatch/swarm_merge.mjs:46-49`.
- **Evidence**:
  ```js
  let wtStat;
  try { wtStat = statSync(wt); } catch { fail(`worktree not found at ${wt}`); process.exit(2); }
  if (!wtStat.isDirectory()) { fail(`worktree path is not a directory: ${wt}`); process.exit(2); }
  ```
- **Impact**: An attacker who can plant a symlink at the operator-supplied worktree path can redirect the subsequent `git -C <wt> ...` invocations and `git apply` to act on a different directory. The operator-trust model (the harness writes the worktree path; operator runs the command) limits exposure. Same posture as the `.sh` original. Listed for completeness; not a regression.
- **Recommendation**: Add `realpathSync(wt)` after `statSync` and use the resolved path for subsequent operations. Reject if the resolved path escapes the project root. ~5-line change. Bundle with LF-1 in the follow-up workflow.

## Dependencies

**No new third-party dependencies.** All ports use Node stdlib only. Confirmed via:

- No additions to `package.json` `dependencies` / `devDependencies`.
- Every `import` in the new `.mjs` files is `node:*` (`node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:util`).
- `package-lock.json` not modified.

## Checks performed

| Area | Method | Verdict |
|---|---|---|
| Command injection (OWASP A03) | Inspected every `spawnSync` call in the 8 new `.mjs` files. All use array-form argv (no shell interpolation). | PASS |
| Path traversal (OWASP A03) | Reviewed `audit.mjs` manifest-driven file reads (paths constrained by `manifest.files` keys; manifest is build-time generated). Reviewed all `--<flag> <path>` CLI inputs in validate / swarm_merge / drift_check / render / lint. | PASS (operator-trust; LF-2 noted) |
| Secrets hygiene | grep'd diff for `api_key`, `password`, `token`, `secret`, `BEGIN PRIVATE KEY`, `.env` writes. | PASS |
| Cryptography (OWASP A02) | `audit.mjs` uses `createHash('sha256')` — standard, identical to `scripts/build-manifest.mjs` pattern. No new crypto code; no homegrown algorithms. | PASS |
| Input validation at trust boundaries | `probe.mjs` JSON.parse from stdin (operator-trust; no untrusted network input). `sweep.mjs` reads CSV `--backlog-keys` arg + memory files (curator-only input). | PASS |
| ReDoS (regex DoS) | Inspected all new regex patterns in `sweep.mjs`, `drift_check.mjs`, `audit.mjs`, `lint.mjs`. No nested quantifiers on overlapping classes; no catastrophic backtracking patterns. | PASS |
| Dependency CVEs | No new dependencies. | N/A |
| Auth / Session / IDOR | N/A — no HTTP / auth surface in this baseline tooling. | N/A |
| TOCTOU on consent markers | Out of scope — `git_commit_guard.mjs` consent flow untouched by this workflow. | N/A |

## Out of scope / Noted

- The original `.py` files had the same LF-1 and LF-2 patterns. This workflow preserves parity; the findings are therefore pre-existing risk, not regressions. They are recorded here so a future workflow can address the cluster (LF-1 + LF-2 + the backlog item `workflow-migrator-write-not-atomic-power-loss-corruption-3e91` + `triage-helper-slug-interpolation-into-bash-subprocess-a720`) as a single defense-in-depth pass.
- `tests/no-python3-in-shipped-tree.test.mjs` adds a structural guard against future regressions (ensures no `python3` invocation reappears in shipped paths). Strengthens supply-chain hygiene (OWASP A08).
- The `audit.mjs` `--file=<rel>` scope-check preserves the same prefix-list as `audit.sh`. Unchanged.
- Test fixture invocation ports (6 files) shifted from `python3 -c '...'` heredocs to `node --input-type=module -e '...'` inline blocks. Each receives input via environment variables (`EVENT_PATH`, `EVENT_ROLE`, `STATE_PATH`, etc.) — operator-controlled, no untrusted input surface.

**Verdict: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (both pre-existing parity-preserved findings).** Workflow proceeds.

