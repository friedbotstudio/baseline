# Pattern Research — create-baseline-cli

The intake (`docs/intake/create-baseline-cli.md`) constrains: Node ≥ 18.17.0, zero runtime dependencies, root-as-package layout, `template/` gitignored and regenerated, `files:` allowlist authoritative, three modes (fresh / `--force` / `--merge`), additive `.mcp.json` merge, NEVER_TOUCH `project.json`, audit-baseline must pass against the shipped overlay. The scout (`docs/scout/create-baseline-cli.md`) confirms the surface is fully bootstrappable from `src/` overlay templates that already exist and pass the audit.

The candidates below differ on **scope of the first ship** and on **how the build script is implemented**, not on whether to use stdlib (the runtime-dep ban is binding) or whether to honor the manifest schema in `docs/create-baseline.md` §50 (versioned schema, sha256, ISO8601). Library-API feasibility is verified against Node v20 docs (the LTS line containing the pinned 18.17 floor) and current npm docs; cited inline.

---

## Confirmed-feasible foundation (not a candidate axis)

These are feasibility checks against the binding constraints. None require a decision.

- **`node:util` `parseArgs`** — stable since Node v20.0.0; supports `args`, `options` (`type: 'string' | 'boolean'`, `short`, `multiple`, `default`), `strict`, `allowPositionals`, `tokens: true`. Throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` / `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL` / `ERR_PARSE_ARGS_INVALID_OPTION_VALUE` in strict mode — sufficient for argv handling without `commander`/`yargs`. (Source: https://nodejs.org/docs/latest-v20.x/api/util.html#utilparseargsconfig)
- **`node:readline/promises`** — `createInterface({ input: process.stdin, output: process.stdout })`, `await rl.question(...)`, `rl.close()`. `rl.question` after `rl.close` returns a rejected promise (matters for AC4 non-TTY exit). `process.stdin.isTTY` is the canonical TTY check. (Source: https://nodejs.org/docs/latest-v20.x/api/readline.html)
- **`fs.promises.cp`** — supports `recursive`, `force`, `errorOnExist`, `filter (src, dest) => boolean | Promise<boolean>`, `dereference`, `verbatimSymlinks`, `preserveTimestamps`. Note: marked **experimental** in v20 docs (the `(stability: 1)` annotation appears in source but the API is functionally stable in 18.17+). The `filter` callback gives us per-path control sufficient to avoid `rsync` for build excludes if we want. (Source: https://nodejs.org/docs/latest-v20.x/api/fs.html#fspromisescpsrc-dest-options)
- **`crypto.createHash('sha256').update(buf).digest('hex')`** — stable, returns hex string. Either buffer-mode (`update(fileBytes)` → `digest`) for small files or stream-mode (`createReadStream(p).pipe(hash)`) for large ones. The shipped baseline files are all small (`.md`, `.json`, `.sh`); buffer-mode is simpler and adequate. (Source: https://nodejs.org/docs/latest-v20.x/api/crypto.html#crypto_class_hash)
- **npm `files:` allowlist** — overrides `.npmignore`; `package.json`, `README` (and variants), and `LICENSE` are always included regardless. The npm registry **must** find the README at the package root (`README.md`); a non-default path in `package.json` is **not** honored — see open-question resolution below. (Source: https://docs.npmjs.com/about-package-readme-files; https://docs.npmjs.com/cli/v11/using-npm/developers — "Keeping files out of your Package")
- **`bin` field** — `"bin": { "create-baseline": "bin/cli.js" }` produces a PATH-installed executable on global install and is what `npx create-baseline` resolves against. (Source: https://docs.npmjs.com/cli/v11/configuring-npm/package-json — "bin")
- **`prepack` lifecycle** — fires before tarball creation on `npm pack`, `npm publish`, **and** when installing a git dependency. `prepublishOnly` fires only on `npm publish`. `prepare` fires on pack/publish/git-install **plus** local `npm install` without args (would re-run the build on every dev install — unwanted here). `prepack` is the right hook for `template/` regeneration. (Source: https://docs.npmjs.com/misc/scripts — "Life Cycle Scripts")
- **`create-*` naming convention** — `npm init <pkg-spec>` is equivalent to `npx create-<pkg-spec>`. An unscoped package named `create-baseline` is reachable as both `npm init baseline` and `npx create-baseline`. (Source: https://docs.npmjs.com/cli/v11/commands/npm-init)

---

## Candidate A: Faithful v0.2 port — full feature set in one ship

- **Summary**: Implement everything `docs/create-baseline.md` describes — `bin/cli.js` + six `src/cli/*.js` modules + `scripts/build-template.sh` (bash) + `scripts/build-manifest.mjs` — with all three modes (fresh / `--force` / `--merge`) plus `--dry-run`, the additive `.mcp.json` merge, the NEVER_TOUCH list, the manifest schema v1, and the documented exit codes (0/1/2/3). Build via bash `rsync` + targeted `cp` overlays (matches the existing harness convention; scout confirms the project standardizes on `set -euo pipefail` shell scripts).
- **API references (current)**:
  - `node@>=18.17` — `node:util` `parseArgs` strict mode — https://nodejs.org/docs/latest-v20.x/api/util.html#utilparseargsconfig
  - `node@>=18.17` — `node:readline/promises` `rl.question` — https://nodejs.org/docs/latest-v20.x/api/readline.html
  - `node@>=18.17` — `fs.promises.cp({recursive,force,filter})` — https://nodejs.org/docs/latest-v20.x/api/fs.html#fspromisescpsrc-dest-options
  - `node@>=18.17` — `crypto.createHash('sha256')` — https://nodejs.org/docs/latest-v20.x/api/crypto.html#crypto_class_hash
  - `npm` — `prepack` lifecycle, `files:` allowlist, `bin` field — https://docs.npmjs.com/misc/scripts, https://docs.npmjs.com/cli/v11/configuring-npm/package-json
  - `rsync` — POSIX availability assumption (macOS + Linux ship it; Windows is not a supported dev env per scout's bash hook tooling).
- **Fits**: Yes — matches `docs/create-baseline.md` §145–225 verbatim and matches the bash-script convention scout observed in `.claude/skills/*/{validate,swarm_merge,render,lint,archive,audit}.sh`. The intake's 14 ACs all map to behaviors in this candidate.
- **Tests it enables**:
  - Argv routing → unit tests on a `parseArgv()` pure function.
  - Sentinel-path detection → fixture targets with each path present.
  - Three-way merge → fixture targets with old manifest + N file states (untouched / customized / new / removed).
  - `.mcp.json` deep-merge → fixture pairs (baseline + user-customized) with linear/github servers added.
  - `audit-baseline` against `template/` post-build and against a fresh install — black-box, no internal mocking.
  - `npm pack` tarball inspection → `tar -tzf | sort | diff -` against an expected file list.
  - Manifest determinism → two consecutive builds produce identical `template/manifest.json` (modulo `generated_at`).
- **Tradeoffs**:
  - **Largest first ship**. ~600–800 lines of CLI source plus a build script. Higher risk of bugs in the merge logic before any user has run it.
  - **Bash for the build script** carries the implicit `rsync` + POSIX-shell dependency on the developer's machine. The shipped CLI is zero-dep, but the *build* is not. This is consistent with the rest of the repo's helper scripts and is the documented intent.
  - **`fs.cp` filter is sync-friendly but per-call** — avoiding rsync entirely (Candidate C) means handling exclude logic in JS, where there's no battle-tested glob-exclude tool without adding a dep.

---

## Candidate B: Phased — fresh + force first, merge in v0.3

- **Summary**: Ship `bin/cli.js` + `src/cli/{io,conflict,manifest,install,mcp}.js` + `scripts/build-template.sh` with **fresh** and **`--force`** modes only on the first ship. Defer `--merge` (the three-way merge logic is the most complex piece) and `--dry-run` to a follow-up `create-baseline-cli-merge` slug. `.mcp.json` additive merge ships on day one because it's invoked in fresh mode too (anywhere the CLI writes `.mcp.json`, additivity matters).
- **API references (current)**:
  - Same as Candidate A minus three-way-merge invocations.
- **Fits**: Partially — the intake AC1–AC4 + AC6–AC11 cover fresh + force; AC5 (merge) and the `--dry-run` open question would be deferred. `audit-baseline` and tarball-shape ACs all still apply.
- **Tests it enables**:
  - Same as Candidate A minus the merge-fixture tests.
- **Tradeoffs**:
  - **Smaller first ship** (~300–400 lines). Faster to land, easier to review, simpler to hold an unambiguous binding test verdict over.
  - **Splits the spec across two slugs**, requiring a second intake → spec → TDD loop later. The current intake explicitly enumerates `--merge` ACs (AC5), so deferring would mean amending the intake or adding a non-goal — both honest moves but visible scope changes.
  - **Users on v0.2 → v0.3 upgrade can't `--merge`** until v0.3 ships. Practical impact is small if the time gap is short, larger if the project drifts into a "v0.2 is good enough" stall. The scout shows `docs/create-baseline.md` was already written for the full feature set; carrying half of it as written-but-not-shipped is a maintenance risk.
  - **Manifest writing on day one** is still required (so v0.3's `--merge` has an old manifest to compare against). That's the one piece of manifest infrastructure that can't be deferred.

---

## Candidate C: Pure-Node build (drop bash; replace `rsync` with `fs.cp` + filter)

- **Summary**: Same CLI surface as Candidate A, but the build script is `scripts/build-template.mjs` instead of `scripts/build-template.sh`. Use `fs.promises.cp(root, 'template', { recursive: true, filter: (src) => !excluded(src) })` for the broad copy, then per-template overlay via a small JS table, then `build-manifest.mjs` (already JS in the design doc). Bash disappears from the build path entirely.
- **API references (current)**:
  - `fs.promises.cp` with `filter` callback (sync or Promise) — https://nodejs.org/docs/latest-v20.x/api/fs.html#fspromisescpsrc-dest-options
  - All other refs identical to Candidate A.
- **Fits**: Mostly — but it diverges from the scout's "shell scripts use `set -euo pipefail` and source `lib/common.sh`" pattern observed in five of the six existing helper scripts (`validate`, `swarm_merge`, `render`, `lint`, `archive`, `audit` — only `audit.sh` is mostly Python). The audit-baseline helper-scripts list expects `.sh` extensions; adding a `.mjs` build helper would not be checked but also wouldn't fit the existing list.
- **Tests it enables**:
  - Same as Candidate A.
  - **Better** test ergonomics for the build script itself — a `.mjs` script is unit-testable from `node:test` without spawning a subprocess; a bash script effectively requires shell-level integration tests.
- **Tradeoffs**:
  - **No `rsync` dependency** on the developer machine; runs anywhere Node runs (Windows-friendly). Useful if anyone ever runs the build from a cleanroom CI image without `rsync`.
  - **Exclude logic must be hand-rolled** — a JS `filter` callback that pattern-matches `path.relative(root, src)` against an exclude list. Glob semantics (`docs/{intake,brd,…}/`) require the implementer to either parse globs themselves or use literal directory-prefix matching. The latter is fine for the documented exclude set; the former adds either a dep or hand-rolled glob code.
  - **Symlink handling** differs subtly between `rsync -a` (preserves symlinks by default) and `fs.cp` (`dereference: false` is the default per v20 docs, but `verbatimSymlinks: false` resolves them). The scout shows no symlinks in the tracked baseline files, but adding `--exclude=lib/__pycache__` is needed in either model for hooks/lib. Risk is low but real.
  - **Diverges from the existing six-script convention** — five of the six helper scripts are bash; introducing JS here adds a second style without removing the first. Defensible but a small cost.

---

## Recommendation

**Candidate A — faithful v0.2 port — full feature set in one ship.**

Rationale, anchored to the inputs:

1. **The design is already fully specified** in `docs/create-baseline.md` §1–225, which the scout confirms is internally consistent and aligned with the audit-baseline contract. Splitting it in half (Candidate B) trades implementation effort for spec-maintenance effort across two slugs and a second `/spec` cycle — net negative when there's no human pressure to ship a partial version sooner.
2. **The merge logic is the single piece most likely to need a follow-up bugfix**, but shipping it later doesn't make it easier — it just delays the test signal. Shipping it now with the documented fixture matrix gets the bug class out of the way before users adopt the package.
3. **Bash for the build script is consistent** with five of six existing helper scripts (`validate.sh`, `swarm_merge.sh`, `render.sh`, `lint.sh`, `archive.sh`) — the project has a pattern, and this CLI shipping in a shell-friendly environment is a safe assumption per the existing tooling. Candidate C's portability win is theoretical until someone actually wants to build on Windows; YAGNI.
4. **Zero runtime deps is preserved in all three candidates.** The choice axis is purely about scope and build-tool style, not about the user-facing surface.

**What would flip the decision:**

- If a near-term ship pressure surfaces (the `npx create-baseline` command appearing in the README is materially blocking adoption), Candidate B's smaller first ship becomes attractive — recommend updating the intake to make `--merge` an explicit non-goal for v0.2.
- If the project gains a Windows developer or moves CI to a cleanroom container without `rsync`, Candidate C's pure-Node build pays off.
- If the spec author finds the merge fixture set is genuinely larger than two waves of TDD can handle in one slug, Candidate B is the principled split.

---

## Open question resolutions (grounded in evidence)

- **README dual-audience** *(intake OQ #1)*: **Single root `README.md` serves both audiences.** npm docs are explicit: the README must be at the package root, and a non-default path is not honored (https://docs.npmjs.com/about-package-readme-files; "essential files [...] always included"). The realistic options are (a) keep one README serving both; (b) split the project README into `DESIGN.md` (already exists per scout) + a tighter user-facing `README.md`. Recommend (b): trim the existing 324-line `README.md` to install + quickstart for the npm-tarball reader, and migrate the deep-architecture sections to `DESIGN.md` or a new `docs/architecture.md`. The "trim" itself is a documentation task, not a CLI task; spec it as a co-change in `/document` rather than blocking the CLI ship.
- **Swarm-worker template ship form** *(intake OQ #3)*: **Ship rendered with default tokens** at `template/.claude/agents/swarm-worker.md`. The `src/agents/swarm-worker.template.md` carries `{{NAME}}`, `{{DESCRIPTION}}`, `{{SKILLS}}`, `{{ROLE_LINE}}`. The build overlay step renders the template with canonical defaults (`name: swarm-worker`, the imperative-voice description from `seed.md` §4.2, skills `["scenario", "implement"]`, role line from canonical seed) before copying. A fresh install therefore has a working agent on day one without `/init-project`. `/init-project` re-renders with stack-specific skills appended later. This matches `docs/create-baseline.md` §111 ambiguity-resolution and is what the audit-baseline `agents` check expects on disk in user projects.
- **`--dry-run` flag scope** *(intake OQ #4)*: **Include in v0.2 (Candidate A).** Trivial to add when each merge decision already produces a per-file action record (`ADD`/`OVERWRITE`/`SKIP`/`NOOP`); `--dry-run` short-circuits before the file write. Adds value primarily for `--merge`. Estimated cost: < 30 lines.
- **Version-pinning hint in install output** *(intake OQ #5)*: **Include.** One `console.log(\`Installed manifest version 1 — pin via "create-baseline@<exact-version>" in your bootstrap docs.\`)` after a successful run. Trivial.
- **Test framework choice** *(intake OQ #6)*: **`node:test` stdlib runner.**
  - Stable in Node v20; supports `describe`/`it`/`test`, `--test-reporter spec|tap`, `--test-name-pattern`, exit code 1 on any failure (per https://nodejs.org/docs/latest-v20.x/api/test.html). All needs of this CLI are covered.
  - Adding `vitest` as a `devDependency` would not violate the *runtime*-zero-dep claim, but it adds 60+ MB to the dev install and a transitive supply-chain surface that brings nothing this CLI uses (no React, no JSX, no source-map magic, no parallelism critical at this scale).
  - `node:test` integrates cleanly with `package.json` `"scripts": { "test": "node --test --test-reporter=spec" }` and requires no new files in the repo's root other than `tests/*.test.mjs`.
  - **Caveat**: `node:test` snapshot/coverage features are weaker than `vitest`'s. Neither is needed here.
- **CI gating posture** *(intake OQ #7)*: **Gate on both `audit-baseline` and tarball shape.** Two checks, cheap, complementary:
  1. `bash .claude/skills/audit-baseline/audit.sh` after `npm pack && tar -xzf create-baseline-*.tgz -C /tmp/audit-target && cd /tmp/audit-target/package && node bin/cli.js /tmp/scratch && cd /tmp/scratch && bash .claude/skills/audit-baseline/audit.sh` — confirms the shipped tarball produces an audit-clean install.
  2. `tar -tzf create-baseline-*.tgz | sort > /tmp/actual && diff /tmp/expected-files /tmp/actual` — confirms `files:` allowlist is exactly what we expect; catches accidental broadening (e.g., someone adds `"docs/"` to `files:` and ships the entire workflow archive).
  3. The audit on raw `template/` post-build is implicit in (1).

  Defer the GitHub Actions workflow definition to seed.md §16 follow-up #2 — but the spec should specify what the gate command **is** so the workflow is just plumbing.

---

## Open questions remaining

- **Publication ownership and 2FA** *(intake OQ #8)*: out of scope for the CLI's own implementation. Surface to `/document` so the README install instructions don't promise more than what's published. No technical decision blocked; humans-and-process question.
- **`docs/<phase>/` exclude list maintenance**: scout flagged this. Recommendation: build-script exclude set should be **`docs/*` minus `docs/init/seed.md`** (keep one canonical doc, exclude everything else under `docs/`) rather than enumerating phase dirs. Cheaper to maintain; adding a new phase doesn't require remembering to extend the exclude list. Spec call.
- **Version field source-of-truth at publish time**: `package.json` `version` is the npm version. The manifest's `manifest_version` is `1` (independent, schema version, not package version). Spec should make this distinction explicit so `npm version patch` doesn't accidentally bump `manifest_version`. Scout noted no current version surface; clean field on first ship.
