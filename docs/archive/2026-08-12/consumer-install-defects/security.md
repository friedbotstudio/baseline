# Security reports — consumer-install-defects

## consumer-install-defects-2026-08-12.md

# Security Review — main (consumer-install-defects) — 2026-08-12

## Summary

Overall risk: **LOW**, and the one MEDIUM was fixed before landing. That finding — a JS-injection vector this diff itself introduced, where the build script interpolated its own directory path into a `node -e` source string — is now closed by an argv-passing form plus two regression tests, and is kept in the report as the record of what was wrong. Everything else is LOW or clean. Two properties the reviewer's brief flagged as suspect were tested and found safe: the new regex does not backtrack catastrophically, and the recursive walk cannot follow symlinks. No new dependencies; `npm audit --omit=dev` reports 0 vulnerabilities.

Diff reviewed: 237 insertions / 77 deletions across 16 tracked files plus 8 untracked (6 test files, the spec, and a new pristine memory stub). Well under the 2000-line ceiling.

## Findings

### [MEDIUM — RESOLVED 2026-08-12] Build script interpolates its own path into an evaluated JS string

> **Resolved in this branch before landing.** `scripts/build-template.sh:158` now passes the module path as an argument to a single-quoted program:
> ```bash
> node -e 'import(process.argv[1]).then(m => process.stdout.write(m.CANONICAL.join("\n") + "\n"))' \
>   "$SCRIPT_DIR/../.claude/skills/memory-index/categories.mjs"
> ```
> Two regression tests were added in `tests/build-template-memory-excludes.test.mjs`: one asserts the extracted `node -e` program contains no shell expansion, the other runs *the program extracted from the script itself* against a real module under a directory named `evil'); process.stdout.write('INJECTED` and asserts the output is the module's `CANONICAL` with no injected text. Both were red before the fix and green after; the rebuilt template still derives 8 excludes and the audit reports 0 fails. The finding is retained below as the record of what was wrong and why.

- **OWASP**: A03 - Injection | **CWE**: CWE-94 (Code Injection)
- **File**: `scripts/build-template.sh:158`
- **Evidence**:
  ```bash
  done < <(node -e "import('$SCRIPT_DIR/../.claude/skills/memory-index/categories.mjs').then(m => process.stdout.write(m.CANONICAL.join('\n') + '\n'))")
  ```
  `SCRIPT_DIR` is `$(cd "$(dirname "$0")" && pwd)`. Because the bash string is double-quoted, the path is expanded *into the JavaScript source* before Node parses it. A single quote in the path terminates the `import('...')` string literal. Demonstrated with a directory named `proj'); process.stdout.write('injected`:
  ```
  import('/tmp/.../proj'); process.stdout.write('injected/../x.mjs').then(...)
                        ^ literal closed; following text parsed as JS
  ```
- **Impact**: An attacker who controls the checkout directory name achieves arbitrary JS execution inside the build, running with the builder's privileges at the step that stamps the shipped manifest. A subtler abuse is to make the derivation emit a *wrong* category list while still exiting 0, which would let dev-repo memory shards ship — defeating D5, the defect this line exists to fix. The empty-list guard at `:154` catches suppression but not substitution.
- **Severity rationale**: MEDIUM not HIGH because the precondition is control of the checkout path, which usually implies control of the checkout. It is not LOW because some CI runners derive workspace paths from branch or PR titles, which are attacker-influenceable.
- **Recommendation**: Stop interpolating into the source. Pass the path as an argument and read it inside the script:
  ```bash
  node -e 'import(process.argv[1]).then(m => process.stdout.write(m.CANONICAL.join("\n") + "\n"))' \
    "$SCRIPT_DIR/../.claude/skills/memory-index/categories.mjs"
  ```
  Note the outer single quotes — the JS source then contains no shell expansion at all. This is the only `node -e` in `scripts/*.sh` carrying a `$` interpolation, so the fix does not generalise to other call sites.

### [LOW] Report path is written wherever `--report-root` points

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs:39,52`
- **Evidence**:
  ```js
  const reportRoot = resolve(args.reportRoot ?? '.');
  await writeReport(reportRoot, report);   // -> <reportRoot>/.claude/state/spec-shippability/shipped-skills.json
  ```
- **Impact**: `--report-root ../../somewhere` writes a JSON file outside the repo. The written content is the scanner's own report, not attacker-chosen, and only whoever invokes the build supplies argv.
- **Recommendation**: Accept as-is, or refuse a `reportRoot` that resolves outside the project root. Recording it here so a future change that takes `--report-root` from a less-trusted source starts from a known position.

### [LOW] Symlink safety in the recursive walk is incidental, not asserted

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-59 (Link Following)
- **File**: `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs:225-241`
- **Evidence**: `findNestedScannableFiles` recurses on `entry.isDirectory()` and collects on `entry.isFile()`. Tested against a tree containing a symlinked directory and a symlinked file:
  ```
  link        isDir=false isFile=false isSymlink=true
  linkfile.md isDir=false isFile=false isSymlink=true
  real        isDir=true  isFile=false isSymlink=false
  ```
  `readdir(..., {withFileTypes: true})` uses lstat semantics, so symlinks satisfy neither branch and are skipped. There is therefore no traversal outside the descriptor root and no symlink-loop recursion.
- **Impact**: None today. The risk is regression: rewriting the walk with `stat()` instead of `Dirent`, or adding an `isSymbolicLink()` branch "for completeness", would silently permit escape from the shipped tree into arbitrary filesystem locations, in a component that gates publishing.
- **Recommendation**: Either a one-line why-comment at the recursion stating that symlinks are skipped deliberately, or a test asserting a symlinked directory under a descriptor root contributes no findings.

### [LOW] `ctx.skipSrc` converts a real config-parity FAIL into a PASS when `src/` is absent

- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-754 (Improper Check for Exceptional Conditions)
- **File**: `.claude/skills/audit-baseline/checks/project-json.mjs:53-60`
- **Evidence**:
  ```js
  if (ctx.skipSrc) {
    const detail = ctx.consumerManifest
      ? 'consumer install (manifest present, src/ absent) — src/ parity check skipped'
      : 'src/ absent — parity check skipped';
    add('project.json <-> template: config parity', 'PASS', detail);
    return rows;
  }
  ```
- **Impact**: Deleting or hiding `src/` in a dev tree suppresses config-drift detection. Minimal in practice: anyone who can delete `src/` can also edit `.claude/project.json` directly, so no privilege is gained. The gate keys on tree *shape*, never on the template file being missing — `src/` present with the template absent still FAILs, which is the property that keeps this from being a general bypass, and it is covered by `test_when_src_present_but_template_missing_then_config_parity_fails`.
- **Recommendation**: No change. The PASS names its reason in the row detail, so a skipped comparison is auditable and never reads as a verified one.

### [LOW] Stack-skill names reach `swarm-worker.md` frontmatter through an instruction recipe

- **OWASP**: A03 - Injection | **CWE**: CWE-1236 (Improper Neutralization of Formula Elements) — by analogy, YAML/frontmatter injection
- **File**: `.claude/commands/init-project.md:118-127`
- **Evidence**: Step 6.4 builds the replacement list from `additions.swarm_worker_skills`, which originates in the recommender's scan of an arbitrary project, and writes each as `  - <skill>` into the agent's frontmatter. A name containing a newline could in principle append further YAML keys — `tools:` being the interesting one, since it defines the subagent's capabilities.
- **Impact**: Low and largely theoretical. The same step requires every named skill to resolve to `.claude/skills/<skill>/SKILL.md` before writing, and a name carrying a newline or path separator will not resolve, so the recipe refuses. The rewrite is also bounded to the `skills:` block, with surrounding bytes asserted unchanged by `test_when_extra_skills_are_added_then_only_the_skills_block_differs`.
- **Recommendation**: Make the implicit check explicit — state in the step that a skill name must match `^[a-z0-9][a-z0-9-]*$` and that anything else is refused by name, rather than relying on the path lookup to fail incidentally.

## Dependencies

No packages added, removed, or version-changed by this diff. `package.json → dependencies` remains the single runtime entry `@clack/prompts@1.4.0`, consistent with the repo's `zero-runtime-dependencies` constraint. `npm audit --omit=dev` → **0 vulnerabilities**.

## Checked and clean

Enumerated so "no finding" is distinguishable from "not examined":

- **ReDoS in `STRICT_DEV_PATH_PATTERN`** (`analyzer.mjs:28-31`) — tested with adversarial inputs (`src/` + `a.`×N + non-matching tail) at 405, 805, 1605 and 3205 characters, and with 2000 repeated slashes. All completed in ≤ 0.07 ms with no superlinear growth. `[\w./-]+` is a flat character class, not a nested quantifier, so backtracking is linear per start position despite the overlap with the trailing `\.`.
- **`SCAN_EXEMPTIONS` cannot silently drop a surface** — `test_when_a_shipped_directory_has_no_descriptor_then_the_suite_fails` asserts every top-level `.claude/<dir>` in the built tree is either a descriptor or an exemption carrying a non-empty reason, so removing a descriptor fails the suite rather than reducing coverage quietly.
- **Unbounded recursion** — depth is bounded by real filesystem depth of `hooks/` and `mcp/` (currently 2), and symlink loops are impossible per the finding above.
- **`import.meta.url` main guard** — a security improvement, not a regression: the module previously executed `main()` and `process.exit()` on import, so any importer inherited a scan and a process kill. It now exports data and runs only as a script.
- **Secrets hygiene** — no tokens, keys, credentials or `.env` references in the diff. The new `src/memory/constraints.template.md` is a pristine stub with frontmatter and prose only, no executable content.
- **Manifest integrity** — every changed baseline-owned file was re-stamped by `npm run build`; `audit-baseline` reports 0 fails with no `hash mismatch` rows, and `test_when_full_change_then_audit_baseline_passes` now asserts that.

## Out of scope / Noted

- The flat-versus-nested finder split flagged during `/simplify` has a security dimension: `commands/`, `agents/` and `output-styles/` are scanned top-level only, so a future subdirectory under any of them would ship unscanned — structurally the same blind spot as D4, which is the defect this batch exists to close. Not changed here because collapsing the finders alters behaviour; it belongs in the follow-up spec already recorded.
- `memory-index` ships without `owner: baseline`, so `categories.mjs` — now the single oracle four modules derive from, including this diff's build-time exclude list — is excluded from manifest hash verification. An undetected edit there changes what the build ships. Pre-existing, outside this diff, and worth a backlog entry.

