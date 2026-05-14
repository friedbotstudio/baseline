# Security reports — install-cleanup-manifest-npmrc

## install-cleanup-manifest-npmrc-2026-05-15.md

# Security Review — install-cleanup-manifest-npmrc — 2026-05-15

## Summary

Risk: **LOW**. The diff makes one supply-chain-relevant change (npm-posture defaults move from on-by-default to opt-in via `--with-npmrc`). The defense-in-depth that previously shipped automatically is preserved as an explicit choice; it is no longer applied to operators who never read the runbook. The other change (excluding `manifest.json` from the install copy) is a scope tightening and introduces no risk.

## Findings

### [LOW] Default npm-posture hardening moves from automatic to opt-in
- **OWASP**: A05 Security Misconfiguration · A06 Vulnerable & Outdated Components | **CWE**: CWE-1188 (Insecure Default Initialization of Resource)
- **File**: `src/cli/install.js:93`, `src/cli/install.js:101`, `bin/cli.js:46-49`, `bin/cli.js:218`, `bin/cli.js:221`
- **Evidence**:
  ```js
  // src/cli/install.js
  export async function freshInstall(templateDir, target, opts = {}) {
    ...
    if (opts.withNpmrc === true) await materializeNpmrc(target);
    await writeBaselineManifest(target);
  }
  ```
  ```js
  // bin/cli.js
  else await freshInstall(templateDir, target, { withNpmrc: !!values['with-npmrc'] });
  ```
- **Impact**: Operators who scaffold with `npx @friedbotstudio/create-baseline ./target` and do not pass `--with-npmrc` will not receive the automatic `target/.npmrc` overlay (`ignore-scripts=true`, `min-release-age=7`). If they then run `npm install` for an unrelated dependency in the new project and that dependency's tree contains a malicious post-install hook, the hook will execute. `min-release-age=7` similarly no longer delays consumption of freshly-published versions. The realized impact is conditional on the operator not having these defaults already set in `~/.npmrc` (operators who do are unaffected).
- **Recommendation**: The `document` phase that follows must surface this trade-off in three operator-visible surfaces: (1) `README.md` quickstart — mention the flag and the security posture it enables; (2) `docs/runbooks/npm-publish.md` — operator-facing runbook should call out that scaffolded projects no longer ship hardened npm defaults by default; (3) `site-src/install.njk` and/or `site-src/cli.njk` — flag documentation in the rendered docs site. After the document phase, this finding stays at LOW; if those docs are not updated, the finding escalates to MEDIUM.

## Things checked and clean

| Concern | Verdict | Evidence |
|---|---|---|
| `materializeNpmrc()`'s existing-file guard preserved when opt-in is true | clean | `src/cli/install.js:84` — `if (await pathExists(dst)) return` is unchanged; existing operator `.npmrc` is never clobbered. Test `test_when_install_runs_with_with_npmrc_flag_and_target_already_has_npmrc_then_existing_npmrc_preserved` defends this. |
| No other code path writes `.npmrc` | clean | grep across `src/`, `bin/`, `scripts/` confirms the only writer is `materializeNpmrc()` in `src/cli/install.js`, which is now reached only via the opt-in branch in `freshInstall` / `forceInstall`. The merge path (`bin/cli.js:197-209`) uses `threeWayMerge` and never invokes `materializeNpmrc`. The doctor path is read-only. |
| `--with-npmrc` input validation | clean | `parseArgs({ ..., strict: true })` rejects unknown flags and validates types; the `'with-npmrc': { type: 'boolean' }` declaration parses to either `true`, `false`, or `undefined`; the call site coerces with `!!values['with-npmrc']`. No injection surface. |
| `COPY_EXCLUDE = ['manifest.json']` does not introduce a path-traversal or sentinel-bypass risk | clean | The check is `COPY_EXCLUDE.includes(rel)` against a normalized relative path. `rel` is computed via `relative(opts.templateRoot, src).split(sep).join('/')` — POSIX-normalized. Excluding a known-safe filename string narrows scope; it cannot widen it. |
| Tarball provenance unchanged | clean | `obj/template/manifest.json` still ships in the published tarball (per `package.json → files: ["obj/template/", ...]`). `npm audit signatures` continues to verify SLSA L3 provenance attestations on published versions; no change to the publish pipeline. |
| Test coverage for AC-007 (supply-chain hardening) | adequate | `test_when_install_runs_with_with_npmrc_flag_then_target_npmrc_exists_with_template_contents` (renamed from `test_when_template_contains_npmrc_then_freshInstall_materializes_it_with_exact_bytes`) asserts the byte-equality of the materialized `.npmrc` against `src/.npmrc.template` when the opt is set. AC-007's intent (operator who chooses the hardening gets the exact spec'd bytes) is preserved. |
| Manifest.json exclusion side effects | clean | The CLI runtime never reads `target/manifest.json` (grep confirms `loadManifest` callers only point at `target/.claude/.baseline-manifest.json`). The shipped tarball still carries `obj/template/manifest.json` for inspection-time provenance via `node_modules/@friedbotstudio/create-baseline/obj/template/manifest.json`. The post-publish install-smoke pipeline that previously consumed this path was removed in the prior workflow restructure; no remaining consumer breaks. |
| Secrets hygiene in diff | clean | No tokens, keys, credentials, or `.env` references introduced. |
| Cryptography surface | n/a | No crypto code touched. |
| AuthN / AuthZ surface | n/a | No auth code touched. |

## Dependencies

No new packages added in this diff. `package.json` and `package-lock.json` are unchanged.

## Out of scope / Noted

- **The `materializeNpmrc()` function and `src/.npmrc.template` content remain in the codebase.** They are reachable only via the opt-in flag now. If a future cleanup chore decides to remove the function entirely (in favor of pure documentation of the recommended `~/.npmrc` defaults), the test `test_when_npmrc_template_exists_in_dev_repo_then_its_bytes_match_spec` (line 68 in `tests/install.test.mjs`) would also need to go. Not a security concern; just a maintenance note.
- **Operator-facing documentation update is the load-bearing follow-up.** The `document` phase scheduled next is the structural mitigation for this finding. If it is silently skipped, this finding's severity rises to MEDIUM.

## Decision

Only LOW findings present. Per the security skill SOP, mark `security` complete and continue to `/integrate`.

