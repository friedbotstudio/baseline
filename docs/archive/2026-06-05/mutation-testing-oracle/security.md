# Security reports — mutation-testing-oracle

## mutation-testing-oracle-2026-06-05.md

# Security Review — mutation-testing-oracle — 2026-06-05

## Summary

Overall risk **LOW** for this change. The diff adds a dev-only mutation-testing wrapper (`scripts/mutation-oracle.mjs`), tests/fixtures, a `test:mutation` script, an exact-pinned `@stryker-mutator/core@9.6.1` devDependency, and `.gitignore` entries. No runtime/consumer surface, no secrets, no auth/crypto. Two things to record: a LOW theoretical command-injection in the dev CLI (no untrusted-input boundary), and an A06 dependency note — **one moderate is attributable to this change (qs); the npm-audit CRITICAL (liquidjs) is PRE-EXISTING via `@11ty/eleventy` and is flagged for separate remediation** (the maintainer already decided at the install checkpoint to proceed and file it).

## Findings

### [LOW] Dev-CLI command string interpolates an unvalidated path argument

- **OWASP**: A03 - Injection | **CWE**: CWE-78 (OS Command Injection)
- **File**: `scripts/mutation-oracle.mjs:~38` (`buildConfig`)
- **Evidence**:
  ```
  commandRunner: { command: `node --test ${testPath}` },
  ```
  `testPath` comes from CLI argv; Stryker executes `commandRunner.command` via a shell. The `npx stryker` spawn itself is safe (`spawnSync('npx', [...], )` — array args, no `shell:true`), but the command STRING Stryker runs is shell-interpreted, so a `testPath` like `t.mjs; <cmd>` would execute `<cmd>`.
- **Impact**: None under the actual threat model — this is a developer-only tool (`npm run test:mutation -- <module> <testPath>`) invoked by the maintainer with their own arguments. There is no untrusted-input boundary (no network/CI-arg/user-upload path feeds these args). Exploiting it means typing a malicious command into your own shell.
- **Recommendation**: Defense-in-depth (not blocking): validate `module`/`testPath` against an allowed pattern (e.g. `^[A-Za-z0-9._/-]+$` and `existsSync`) at the top of `runOracle`/`main`, rejecting shell metacharacters. Cheap, makes the dev-only assumption explicit.

## Dependencies

`@stryker-mutator/core@9.6.1` added as a **devDependency** (exact-pinned). `npm audit` reports 5 vulns; provenance (`npm ls`):

| Package | Severity | Top-level source | Attributable to THIS change? |
|---|---|---|---|
| liquidjs (RCE/XSS/ReDoS) | **critical** | `@11ty/eleventy` → liquidjs | **No — pre-existing** |
| ws (mem disclosure) | moderate | `@11ty/eleventy` → eleventy-dev-server → ws | No — pre-existing |
| brace-expansion (DoS) | moderate | npm (bundled) | No |
| qs (stringify DoS) | moderate | `@stryker-mutator/core` → typed-rest-client → qs | **Yes** |

- **qs (the only added risk)**: reachable only through `typed-rest-client`, which Stryker uses for its **optional dashboard reporter**. This oracle configures `reporters: ['json']` only — the dashboard/HTTP path is never exercised, so the DoS is unreachable in our usage. Acceptable for a dev-only tool.
- **devDependency, not dependency**: confirmed `@stryker-mutator/core` is absent from `dependencies` (AC-007 ship-guard test asserts this), so `npx @friedbotstudio/create-baseline` consumers never install it.

## Out of scope / Noted

- **PRE-EXISTING CRITICAL — `liquidjs` via `@11ty/eleventy`** (GHSA-gf2q-c269-pqgc RCE + 5 others). Not introduced by this branch; surfaced because `npm install` re-ran the audit. It affects the site-build toolchain (dev-only: `eleventy` build/serve). **Recommendation: file a separate chore/bugfix** to bump `@11ty/eleventy` (or run a targeted `npm audit fix`) and re-audit — do NOT bundle it into this oracle change (it'd risk an eleventy major bump mid-feature). The maintainer accepted this split at the install checkpoint; capturing here for the backlog.
- **AC-007 dev-only boundary holds**: `scripts/` is absent from the npm `files` whitelist; `obj/template/` is stryker-free (ship-guard test green); the advisory report writes only to the gitignored `.claude/state/mutation/`.
- **`new Date()` in the CLI** (`mutation-oracle.mjs` main) is fine — it's a dev CLI, not a workflow-state writer (the Date-ban is a resume-determinism concern for hooks/state, not dev scripts).

