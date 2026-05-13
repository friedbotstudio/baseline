# Pattern Research — npm-publish-prep

## API verification approach

npm CLI surfaces (`npm pack`, `npm publish`, `npm pack --dry-run --json`, `npm unpublish`, `npm deprecate`) were verified against the locally installed `npm@11.11.0` via `npm help <cmd>` and a real `npm pack --dry-run --json` invocation in this repo. The local `npm help` output IS the authoritative reference for the version actually running on the operator's machine; for a bundled CLI tool we'd otherwise pin via context7, the local install is the higher-fidelity source. Context7 was not consulted for npm itself — `npm help` is canonical.

**Concrete shapes captured at research time** (against `npm@11.11.0`, this repo at HEAD):

- `npm pack --dry-run --json` returns a JSON array; element 0 keys: `[id, name, version, size, unpackedSize, shasum, integrity, filename, files, entryCount]`.
- Each `files[i]` element has shape `{path: string, size: int, mode: int}`.
- `npm help pack` documents `--dry-run: "report what it would have done"` and `--pack-destination: directory in which npm pack will save tarballs` (npm 7+).
- `npm help publish` documents `--dry-run`, `--tag`, `--access`, `--unpublish` is its own subcommand, `--deprecate` is its own subcommand.

**Key behavior question that filters candidates**: does `npm pack --dry-run` run the `prepack` lifecycle script? Per `npm-scripts` docs (verified via `npm help scripts` locally), `prepack` runs on `npm pack` AND `npm publish` — but `--dry-run` explicitly means "don't make changes". Empirically the `--dry-run --json` call in this repo did NOT trigger prepack (it returned in under 1 second; prepack runs audit-baseline + rsync which takes seconds). So `--dry-run` skips lifecycle scripts. **Consequence**: any smoke test asserting the *real* shipped tarball MUST use `npm pack` (no `--dry-run`).

---

## Deliverable A: Tarball smoke test

### Candidate A1: `npm pack` to a tmpdir, then `npm install` the .tgz, then exec `create-baseline`

- **Summary**: From a fresh `mktemp -d` workspace: `cd $TMP && npm pack <repo-path> --pack-destination .` produces `create-baseline-0.1.0.tgz`. Then `npm install ./create-baseline-0.1.0.tgz` in a second `mktemp -d` workspace installs `create-baseline` as a local dep. Finally `npx create-baseline ./target-empty-dir` materializes the baseline; the test asserts `target/.claude/`, `target/CLAUDE.md`, `target/.mcp.json` exist with non-empty bodies.
- **API references (current)**:
  - `npm@11.11.0` — `npm pack [<pkg-spec>] --pack-destination <dir>` — verified via `npm help pack`.
  - `npm@11.11.0` — `npm install ./local.tgz` — verified via `npm help install` ("Tagged spec or path to tarball").
  - Node — `fs.promises.mkdtemp(path.join(os.tmpdir(), 'prefix-'))` — established pattern in `tests/install.test.mjs` and `tests/cli.test.mjs`.
- **Fits**: Yes. Matches the existing pattern in `tests/cli.test.mjs:*` and `tests/install.test.mjs:*` (both use `mkdtemp` + `execFileSync`). Scout report flagged `tests/npm-pack-tarball.test.mjs` as the only existing publish-adjacent test — A1 extends that file's surface, not replaces it.
- **Tests it enables**: Golden-path (tarball installs + CLI runs to completion), negative-path (deliberately remove `obj/template/manifest.json` from the tarball BEFORE install via `tar -xzf` + repack, assert CLI errors out with named missing file), idempotency (run CLI twice into same target with `--force` — established existing fixture pattern).
- **Tradeoffs**: Slow — `npm pack` triggers `prepack` (full audit + rsync, 2–5s) and `npm install` does a tree resolution even though there are zero runtime deps (~1s). Total smoke ≈ 8–15s. That's the cost of testing the real artifact. The alternative is faking it, which doesn't test what we publish.

### Candidate A2: `npm publish --dry-run` against a private registry mock

- **Summary**: Spin up a `verdaccio` local registry (or `npm-cli-registry-mock`), publish to it, then install from it. This is the production publish path minus the network egress.
- **API references (current)**:
  - `verdaccio@^5` — registry server — would need to be added as a devDependency. **NOT confirmed via context7**: would require new dep.
- **Fits**: No. Adds a `verdaccio` devDependency (~20 MB transitive). Intake explicitly rules out new runtime deps; even though verdaccio is dev-only, its surface (config, ports, lifecycle) is a separate operational concern. Also: `verdaccio` simulates the registry, not the tarball — it doesn't add coverage A1 lacks.
- **Tests it enables**: Same as A1 plus version-conflict and registry-auth scenarios, which are out of scope per intake non-goals.
- **Tradeoffs**: REJECTED. Heavier setup, more moving parts, no incremental coverage over A1.

### Candidate A3: `npm publish --dry-run` (no registry — the built-in flag)

- **Summary**: `npm publish --dry-run` runs prepack + all the pack-time validation but doesn't push to the registry and doesn't emit a tarball locally. Output is JSON describing what WOULD happen.
- **API references (current)**:
  - `npm@11.11.0` — `npm publish --dry-run` — verified via `npm help publish`.
- **Fits**: Partially. It runs prepack (unlike `npm pack --dry-run`) so it exercises the full publish-time lifecycle. But the lack of an actual tarball means we cannot install + execute the published artifact. So this verifies *would-publish-without-error* but NOT *artifact-works-after-install*.
- **Tests it enables**: Sanity check that prepack passes without warning. Useful as a *cheap precheck* before the expensive A1 smoke.
- **Tradeoffs**: Useful as a complement to A1, not a replacement. Add it to `publish:check` as a fast pre-step before the full smoke.

**Recommended for A: A1 (real `npm pack` to tmpdir + install + exec) as the canonical smoke; add A3 (`npm publish --dry-run`) as a fast pre-step.**

---

## Deliverable B: files-diff confirmer

### Candidate B1: `npm pack --dry-run --json` → parse `files[].path` → compare against `package.json → files:`

- **Summary**: One `execSync('npm pack --dry-run --json')` per check; parse JSON; for each declared prefix in `package.json → files:` (e.g., `"bin/"`, `"src/"`, `"obj/template/"`, `"README.md"`), assert at least one packed file matches; for each packed file, assert its path matches a declared prefix.
- **API references (current)**:
  - `npm@11.11.0` — `npm pack --dry-run --json` — verified empirically in this repo, returns `entryCount: 192, files: [{path, size, mode}, ...]`.
- **Fits**: Yes. Matches the exact pattern already in `tests/npm-pack-tarball.test.mjs:8-13` (the existing test parses this same JSON shape). Reuses local-tooling-only — no new deps.
- **Tests it enables**: AC-002 (every declared `files:` prefix has ≥1 packed entry), AC-007 (declared-vs-actual symmetric diff), the negative-path case (delete `obj/template/manifest.json` source before check → declared `obj/template/` prefix still matches (other files), but `obj/template/manifest.json` specifically is absent — assert by name).
- **Tradeoffs**: `--dry-run` skips prepack. For files-diff this is FINE because we want to audit the *declared* allowlist, not exercise the build hook. Speed: <1s per invocation.

### Candidate B2: `tar -tzf create-baseline-0.1.0.tgz` after real `npm pack`

- **Summary**: Run `npm pack` (real, full lifecycle) to produce the tarball, then `tar -tzf <tarball>` to list contents, then parse the line-per-file output.
- **API references (current)**:
  - POSIX `tar -tzf <file>` — universal; verified to ship on macOS + Linux.
  - GNU tar's `--format` differs from BSD tar's; sticking to `tar -tzf` (just list, no flags) is portable.
- **Fits**: Yes for the *content* check, but the test is now 8-15s instead of <1s. Only valuable if we want to assert byte-for-byte what shipped, which AC-007 doesn't require.
- **Tests it enables**: Same as B1.
- **Tradeoffs**: Heavier than B1 with no incremental coverage. Use it ONLY in the smoke test (A1), where we already paid the `npm pack` cost.

### Candidate B3: `npm-packlist` package (programmatic API)

- **Summary**: `import packlist from 'npm-packlist'; const files = await packlist({ path: REPO });` returns the array of paths npm would pack.
- **API references (current)**:
  - `npm-packlist@^9` — `packlist({path})` returns `Promise<string[]>` — **would need to be added as a devDependency**. Confirmed via context7 search would be the next step if selected.
- **Fits**: No. Adds a new devDependency for behavior we can get from `npm pack --dry-run --json` (which IS npm-packlist internally — `npm pack` uses it). YAGNI per seed.md.
- **Tests it enables**: Same as B1.
- **Tradeoffs**: REJECTED. Reinventing what `npm pack --dry-run --json` already exposes.

**Recommended for B: B1 (`npm pack --dry-run --json` parsing).** It's what the existing `tests/npm-pack-tarball.test.mjs` already does; we extend that test file's existing pattern.

---

## Deliverable C: `publish:check` orchestrator

### Candidate C1: Bash script at `scripts/publish-check.sh`

- **Summary**: Single bash file. Steps: (1) call `npm publish --dry-run` as the fast precheck; (2) call `node scripts/check-files-diff.mjs` (a small node helper that does the B1 JSON parse); (3) call `node scripts/smoke-tarball.mjs` (does A1). Each step exits non-zero on failure; the orchestrator surfaces a per-step PASS/FAIL summary at the end.
- **API references (current)**: bash + node — both already used in this repo (build-template.sh + build-manifest.mjs).
- **Fits**: Yes. Matches existing build infrastructure pattern (bash orchestrator + small node helpers per stage). Operators already run bash via npm scripts in this repo.
- **Tests it enables**: AC-001 (`publish:check` exits 0 against current tree), AC-008 (failing sub-check surfaces its name in the summary).
- **Tradeoffs**: Two-language stack (bash + mjs). But that's already the convention here — `scripts/build-template.sh` calls `scripts/build-manifest.mjs`. Consistency wins.

### Candidate C2: Single node script at `scripts/publish-check.mjs`

- **Summary**: All-in-node orchestrator. Uses `child_process.execSync` for the npm calls. Single file, no bash.
- **API references (current)**: Node `child_process` — established in this repo.
- **Fits**: Yes. Single language. But it duplicates orchestration logic that bash handles more idiomatically (pipefail, set -e, structured stderr capture).
- **Tests it enables**: Same as C1.
- **Tradeoffs**: Slightly more verbose than bash for shell-style orchestration. Easier to add structured JSON output if needed later.

### Candidate C3: Composite npm scripts (no orchestrator script)

- **Summary**: Three sub-scripts: `publish:precheck`, `publish:files-diff`, `publish:smoke`. The top-level `publish:check` = `npm run publish:precheck && npm run publish:files-diff && npm run publish:smoke`.
- **API references (current)**: `package.json → scripts` — standard.
- **Fits**: Yes. Most transparent — every sub-step is independently runnable. But the `&&` chain means stderr ordering on failure can be confusing, and per-step summary is harder to format.
- **Tests it enables**: Same as C1/C2.
- **Tradeoffs**: Loses the unified PASS/FAIL summary that AC-008 specifies ("a one-line 'FAIL: <check name>' summary"). Could fix by adding a wrapper script — at which point we're back to C1 or C2.

**Recommended for C: C1 (bash orchestrator + node sub-scripts).** Matches the existing `scripts/build-template.sh` + `scripts/build-manifest.mjs` precedent; bash gives us a clean per-step summary via `set -e` + trap.

---

## Recommendation (combined)

- **A1 + A3** for the smoke test: `scripts/smoke-tarball.mjs` runs the real `npm pack` + install + exec dance; `scripts/publish-check.sh` invokes `npm publish --dry-run` as a fast pre-step before falling through to the heavy smoke.
- **B1** for the files-diff: `scripts/check-files-diff.mjs` parses `npm pack --dry-run --json` and asserts declared-vs-actual symmetry.
- **C1** for the orchestrator: `scripts/publish-check.sh` chains the three sub-steps and emits a single FAIL/PASS summary.

The 5-script footprint (1 bash + 2 mjs new + extension of 1 existing test file + 1 new runbook) is the smallest set that satisfies all 8 intake ACs.

## What would flip the decision

- If the operator pool ever exceeds one person and we add CI, B-via-CI could swap to `npm-packlist` (B3) as a deeper-integration option since CI's marginal cost of a new dev dep is lower.
- If the smoke test takes >30s end-to-end on the operator's hardware (intake's "publish:check stays under 30s" implicit threshold), A1's tmpdir install would need to swap to `npm install --no-save --prefer-offline` flags — measured during integrate.
- If we add `npm publish --provenance` (currently a non-goal pending CI), the publish:check would need to embed a separate provenance-token check.

## Open questions

- **Pack-destination directory hygiene**: `npm pack --pack-destination $TMP` (npm 7+) is cleaner than `cd $TMP && npm pack <repo>`, but the latter avoids the npm-CLI-resolves-package-name step (which could fail in a transient registry-down scenario). Spec author picks one — recommend the first, since the registry isn't consulted for a local path argument anyway.
- **Negative-path fixture construction**: should the negative-path test extract the real tarball, delete `obj/template/manifest.json`, repack with `tar -czf`, then install — OR should it build a separate broken tarball from scratch by copying the source tree, deleting the file, and `tar -czf`'ing that directly? The first exercises the real shipping artifact more closely; the second is faster and more deterministic. Spec author picks.
- **Runbook location**: `docs/runbooks/npm-publish.md` (intake's specified path) vs `docs/release/npm-publish.md` (would match a `docs/release-notes/` follow-up). Recommend keeping `docs/runbooks/npm-publish.md` per intake; release-notes are a separate concern.
