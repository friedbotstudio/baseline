# Codebase Scout Report — skill-ownership

## Primary touchpoints

- `.claude/skills/<slug>/SKILL.md` (×36) — every baseline skill needs `owner: baseline` added to its YAML frontmatter. Existing keys in use across the 36 files: `name`, `description`, `argument-hint`, `disable-model-invocation`, `metadata`, `tools`, `version`. No collision with `owner:`.
- `.claude/skills/audit-baseline/audit.sh:1-100` — the consumer of any lock file. Single-script bash + heredoc python3. Defines `EXPECTED_SKILLS` (set literal at line ~48) — the canonical list of 36 baseline skill slugs that already lives in the audit. Drift-on-disk check is at `check_names` calls around lines 199-202. The new lock-vs-disk check must add a new `add("...lock...", "PASS|FAIL", "...")` row inside the same python heredoc; no Bash function-style hooks exist to splice into.
- `scripts/build-manifest.mjs` (full file, 45 lines) — **already produces a sha256 table** of every file shipped in `obj/template/`. Uses `node:crypto`, `node:fs`, zero deps. Output: `obj/template/manifest.json` (171 lines, 1 entry per file). This existing infra is the natural place to layer skill ownership.
- `scripts/build-template.sh:78` — Stage 3 calls `build-manifest.mjs`. Any new lock generator either replaces/extends `build-manifest.mjs` or runs as a new Stage 4. The script already runs `audit-baseline` as Stage 0 — adding `owner:` frontmatter without regenerating the lock would fail the audit there before publish.
- `obj/template/manifest.json` — built artifact, sha256 of every shipped file. **Shape exactly matches what the intake calls "the lock file."** Key insight: a "baseline lock" already exists in spirit; what's missing is the `owner:` provenance dimension.
- `bin/cli.js:194` — on `--merge`, reads `<target>/.claude/.baseline-manifest.json` (the target-side mirror of the build-time manifest, written into the user's repo by `freshInstall`/`forceInstall`/`merge`). This is the closest existing analogue to the proposed `.claude/baseline.lock.json` — same shape, different name, already wired into install/upgrade flow.
- `docs/init/seed.md:184-247` (§4.3 Skills) — the constitutional enumeration of 36 skills by category. Any new ownership convention must be cited here.
- `CLAUDE.md` Article IX (lines around the "Project memory" header) — closest existing article in tone (on-disk provenance, drift detection, audit re-verification). Intake proposes a new Article XI; scout confirms no existing article covers skill provenance.

## Entry points that reach this code

- `npm run build` / `npm prepack` → `scripts/build-template.sh` — where the lock gets generated.
- `bash .claude/skills/audit-baseline/audit.sh` — where lock-vs-disk drift is detected. Also invoked by Stage 0 of build-template.sh.
- `npx create-baseline <target>` → `bin/cli.js → freshInstall/forceInstall/merge` — where the lock ships into a user's repo (today: `.claude/.baseline-manifest.json`).
- `bin/cli.js doctor` subcommand — reads `.baseline-manifest.json` to detect post-install drift in a user's target (tests/doctor.test.mjs:18-117 cover the cases).

## Existing tests

- `tests/manifest.test.mjs` — covers the build-time sha256 manifest shape. The new lock-vs-disk drift check will need parallel test coverage here or in a new file.
- `tests/template-payload.test.mjs:1-40+` — allowlist of paths that `obj/template/` may contain. **Landmine**: if the lock lives at a new path (e.g., `.claude/baseline.lock.json`) it must be added to `ALLOWED_PREFIXES`, or the test fails.
- `tests/template-drift.test.mjs:1-40+` — mirror invariant: `src/CLAUDE.template.md == CLAUDE.md`, plus settings + .mcp. Does NOT cover SKILL.md mirrors today, so adding `owner:` frontmatter to live SKILL.md does not trip this test — but if the lock has a source-of-truth copy in `src/`, a new mirror pair would be needed.
- `tests/doctor.test.mjs:1-117` — covers manifest-driven drift detection in target projects. Will need extension if `owner:` data lands in `.baseline-manifest.json`.
- `tests/build-template.test.mjs`, `tests/build-audit-gate.test.mjs` — cover the build pipeline. Both will run the new lock generator implicitly and assert it produces clean output.
- `tests/cli.test.mjs:73` — asserts `.claude/.baseline-manifest.json` lands in target after fresh install. Status: passing.
- `tests/render-swarm-worker.test.mjs`, `tests/tdd-step-6.test.mjs`, `tests/design-ui-classification.test.mjs` — read SKILL.md frontmatter. **Verified**: none parse strictly; adding `owner:` will not break them.
- `tests/harness_continuation.test.mjs`, `tests/spec-lint-design-calls.test.mjs` — interact with skills indirectly; no frontmatter-key dependency.
- 21 test files total under `tests/`, using `node:test`. Convention: each test imports from `node:test`, asserts via `node:assert/strict`, uses tmp dirs via `node:os.tmpdir()`.

## Constraints and co-changes

- **audit.sh is bash + python3 only — no Node.** Adding the lock check inside the existing python heredoc is the only path. The lock file must be JSON (python `json.loads` ready). `node:crypto`-produced sha256 hashes round-trip cleanly to python's `hashlib.sha256`.
- **`obj/` is git-ignored** (`.gitignore` line: `obj/`). The lock file as a build output cannot be the source of truth — the source of truth is either (a) the SKILL.md frontmatter itself (audit re-derives the list) or (b) an explicit `src/.claude/baseline.lock.json` committed alongside other `src/*.template.*` pristine files.
- **`build-manifest.mjs` already exists and already hashes every shipped file** including SKILL.md. The decision the spec must make: extend the existing manifest format with an `owner:` dimension per skill slug, OR ship a parallel `baseline.lock.json` that focuses on skills only. Either path keeps `node:crypto`-based hashing; duplicating the hash logic is YAGNI.
- **`.claude/.baseline-manifest.json` is the target-side mirror that already gets shipped to user repos.** It is the natural carrier for `owner:` provenance, and the CLI already wires it into install/merge/doctor. Spinning up a parallel `baseline.lock.json` at the target risks two-source-of-truth confusion.
- **`docs/init/seed.md` §4.3** enumerates 36 skills by category — adding `owner:` is a §4.3 amendment. The audit's `EXPECTED_SKILLS` python set (audit.sh:48-67) also enumerates the 36; both must stay in sync.
- **CLAUDE.md** has 10 Articles plus appendices. Article VIII has the hook-coverage table (would need a row if a new write-boundary guard enforces `owner:`). Article IX is about memory, not artifacts. New Article XI is the cleanest fit; alternative: amend the §4.3 reference within Article II/Appendix A.
- **`.claude/project.json` keys**: `$schema_version`, `additions`, `artifacts`, `configured`, `consent`, `destructive`, `harness`, `lint`, `swarm`, `tdd`, `test`, `workflow`. No ownership/lock keys today. Adding configurability (e.g., `ownership.strict_mode: true`) is possible but not obviously required for v1.
- **`artifact_template_guard.sh`** (the only hook that references SKILL.md by path, line 128) treats SKILL.md as a destination, not a thing to parse. No hook currently validates SKILL.md frontmatter; adding `owner:` does not break any guard.
- **`scripts/render-swarm-worker.mjs`** renders the one subagent. Not skill-related; no co-change.
- **template-payload.test.mjs ALLOWED_PREFIXES** must allow whatever path the lock lands at.

## Patterns in use here

- **Single-script audit, multi-check shape.** audit.sh is one long bash file embedding a python3 heredoc that accumulates `(name, status, detail)` tuples and prints a summary table. New drift checks follow the same shape: a python block that compares disk to a canonical source and calls `add(...)`. No plugin architecture — extend in place.
- **Build outputs under `obj/`, sources under `src/` and `.claude/`.** `obj/template/` is the npm payload root; the manifest.json and (proposed) baseline.lock.json live there. `src/*.template.*` are pristine commit-time copies of files that must not drift; `template-drift.test.mjs` enforces mirror equality. The lock is a derived artifact and should follow the manifest.json pattern: no `src/` copy, regenerated each build.
- **Frontmatter as authoritative metadata.** All 36 SKILL.md files use YAML frontmatter for `name`, `description`, and (optionally) `argument-hint`, `disable-model-invocation`, `tools`, `metadata`, `version`. Adding `owner:` follows the established pattern. Order-of-keys is by convention not enforced (each skill orders differently); the spec should not require a specific ordering.
- **Hashing via `node:crypto`, comparison via python `hashlib`.** Build hashes in Node, verify in Python — the audit speaks both. JSON is the wire format.
- **Test convention.** `node:test` + `node:assert/strict`, one file per concern, tmp-dir isolation via `mkdtemp(tmpdir(), ...)`. New tests go in `tests/<concern>.test.mjs`; no test directory hierarchy.
- **Drift detection is hard FAIL.** Every existing audit row that finds disagreement returns FAIL with a precise detail string. No advisory warnings or opt-out — matches the intake's position.

## Risks / landmines

- **Two-manifest risk.** `obj/template/manifest.json` (build-time, ships with npm) and `.claude/.baseline-manifest.json` (target-side, written by CLI) already exist and already hash every shipped file. Introducing a third `.claude/baseline.lock.json` that overlaps in purpose is a code-debt magnet. **`/research` must explicitly decide**: extend the existing manifest with owner provenance, OR ship a separate skill-focused lock, OR replace the existing manifest. The intake's open question about "source-of-truth location" needs to factor in the existing pair.
- **EXPECTED_SKILLS duplication.** The audit's `EXPECTED_SKILLS` python set (audit.sh:48-67) is currently the canonical list of baseline skill slugs. A new lock file that lists the same slugs creates two-source-of-truth. **The spec should pick one**: either delete `EXPECTED_SKILLS` and derive from the lock, or keep `EXPECTED_SKILLS` and treat the lock as a hash-only addendum. Mixing both will rot.
- **Order-of-keys non-determinism risk.** The 36 SKILL.md files do not have a consistent key order in their frontmatter. The migration script (or manual edits) that adds `owner:` must pick an insertion position; spec must define it (top? after `description`? bottom?) so future audits don't flag "owner moved" as drift.
- **Audit must keep passing in project-agnostic mode.** A baseline install where the user has not yet run `/init-project` has `configured: false` in project.json but all 36 baseline skills on disk. The lock check must work in this state; it cannot depend on init-time configuration.
- **Frontmatter parser edge cases.** `tests/design-ui-classification.test.mjs` and `tests/tdd-step-6.test.mjs` read SKILL.md content — verified non-strict, but `/research` should re-check whether any consumer treats unknown frontmatter keys as fatal.
- **Hash scope ambiguity reaches the file system.** Most baseline skills carry sibling files: `references/*.md`, helper scripts (e.g., `audit-baseline/audit.sh`, `swarm-plan/validate.sh`), `template.md` (artifact skills), `SCENARIO.md`. The intake position is "hash everything under `<slug>/`" but the existing `build-manifest.mjs` already hashes everything in the entire shipped tree. The spec must decide whether the per-skill lock entry duplicates those hashes or just references them.
- **Pristine-template invariant.** `tests/template-drift.test.mjs` enforces mirror equality between `src/CLAUDE.template.md` and the live `CLAUDE.md`. If the constitution gains an Article XI, the template copy must be updated in the same commit or this test trips.
- **§16 reservation in seed.md.** `src/seed.template.md` is the pristine genesis carrying the §16 placeholder. The live `docs/init/seed.md` here has §16 populated (per `/init-project`). Audit enforces this divergence. Adding new sections that span §16 (e.g., a new §17 — wait, the file ends at §16) requires the template copy and the live copy to diverge cleanly.
- **CLAUDE.md "configured: true" gating.** This dev repo's `.claude/project.json` has `configured: true`. The npm-shipped template carries `configured: false`. Any project.json schema change for ownership/lock config must be applied to both `src/project.template.json` and `.claude/project.json`, and template-drift's `MIRROR_PAIRS` list must be checked for any new mirror needs.
- **EXPECTED_SKILLS count vs the audit's headline-count regexes.** The audit also sweeps prose for "<n> skills" mentions (audit.sh:568-624 region) and asserts headline counts match disk reality. Adding the chore skill bumped the count to 36; any rename/removal driven by this workflow must propagate to seed.md prose, CLAUDE.md Appendix B, README, the site under `site-src/`, AND audit's expected sets.
- **artifact_template_guard.sh** treats SKILL.md as immutable boilerplate. It will not block `owner:` additions, but the spec should confirm by reading hook behavior end-to-end before relying on it.
- **`obj/` regenerated each build.** The lock file at `obj/template/.claude/baseline.lock.json` is wiped by `rm -rf "$TEMPLATE_DIR"` at build start (`scripts/build-template.sh:31`). No persistence concern; just be aware the dev-repo audit may read a stale lock if `obj/template/` is not rebuilt before audit. Audit currently reads `obj/template/manifest.json` via direct path — same convention applies.
