# Pattern Research — skill-ownership

The scout established that `.claude/.baseline-manifest.json` (target-side) and `obj/template/manifest.json` (build-time) already exist as sha256 tables of every shipped file, produced by `scripts/build-manifest.mjs`. The CLI writes the target-side mirror on `freshInstall` / `forceInstall` / `merge`; `doctor` and `--merge` consume it. Adding `owner:` provenance to a system that already hashes every file is the real shape of this work.

This memo surfaces three concrete approaches. Each picks a coherent answer to all five coupled questions in the brief (storage location, canonical baseline-skill list, hash scope, migration, constitutional placement). The differences are real: one is minimal and reuses existing manifest plumbing; one ships a parallel skill-focused lock; one consolidates everything into a single richer manifest.

## Shared infrastructure (constant across candidates)

The following are not candidate choices — they are constraints the existing codebase fixes:

- **Hash algorithm**: sha256, via `node:crypto` `createHash('sha256').update(buf).digest('hex')`. Confirmed via context7 (`/websites/nodejs_latest-v22_x_api → crypto.createHash`) — API is stable since Node 18, and `build-manifest.mjs:24-33` already uses exactly this pattern. The repo's `package.json` engines pin is `>=18.17.0` so the synchronous `readFileSync` + `createHash().update(buf).digest('hex')` shape is portable.
- **Lock format**: deterministic JSON, sorted-keys, trailing newline, two-space indent. `build-manifest.mjs:37-41` sorts the file list before building the object, and writes `JSON.stringify(manifest, null, 2) + '\n'`. Re-use this exactly.
- **Frontmatter parser**: minimal regex inside Node. The repo has no YAML parser today (verified — `grep -rln "yaml" scripts/ bin/` returns nothing; `js-yaml` is not in `package.json` and the brief forbids adding it). `render-swarm-worker.mjs` does pure string substitution with no YAML involved. The new generator reads the file, locates the `---` block at the top via `^---\n([\s\S]*?)\n---\n` and matches `^owner:\s*(baseline|user)\s*$` line-by-line. Anything more clever is YAGNI for a one-key validation.
- **Audit-side parser**: python3 `re.search` against the same two patterns. `audit.sh` already uses python3 regex throughout (e.g., the `MEMORY_*` and headline-count regexes around lines 568-624) — no new dependency.

## Candidate A — Frontmatter-only, derive from disk (no lock file)

- **Summary**: `owner: baseline | user` is added to every SKILL.md frontmatter. The audit reads frontmatter on disk and treats `owner: baseline` as the baseline-skill enumeration. No new lock file is generated; `obj/template/manifest.json` is left alone (it already hashes everything by path).
- **API references (current)**:
  - `node:crypto.createHash` — `/websites/nodejs_latest-v22_x_api/crypto.createHash` — already used in `build-manifest.mjs`.
  - Python `re.search` — stdlib — already used throughout `audit.sh`.
- **Fits**: yes — single new audit check, no new generator, no new on-disk artifact. Matches the "extend in place" pattern from the scout report ("New drift checks follow the same shape: a python block that compares disk to a canonical source").
- **Tests it enables**:
  - All 36 baseline SKILL.md files declare `owner: baseline` (static enumeration).
  - User skill (`owner: user`) ignored by audit.
  - Missing `owner:` triggers FAIL with the offending slug.
  - Adding `owner: invalid_value` triggers FAIL.
- **Tradeoffs**:
  - **Pro**: smallest blast radius. One new audit check, 36 SKILL.md edits, two amended docs. No build-pipeline change.
  - **Pro**: no two-manifest risk — `EXPECTED_SKILLS` (audit.sh:48-67) becomes the only baseline-slug enumeration *or* is deleted in favor of frontmatter-driven enumeration; pick one.
  - **Con**: misses AC4 ("tampering with the content of any baseline SKILL.md causes the audit to exit non-zero with `hash mismatch`"). Frontmatter alone does not detect content drift inside the body of a SKILL.md.
  - **Con**: leaves the future `upgrade` subcommand without per-skill hashes — `upgrade` would have to recompute hashes against the live tree to know which files to overlay, which is doable (re-derive from disk) but slower than a pre-baked lock.
  - **Con**: no protection against drift in supporting files under `<slug>/` (references/, helper scripts, templates).
- **Files touched**: 36× `.claude/skills/<slug>/SKILL.md` (frontmatter add); `.claude/skills/audit-baseline/audit.sh` (one new check); `docs/init/seed.md` §4.3 (one paragraph); `CLAUDE.md` (one new sub-article or Article VIII row); `src/CLAUDE.template.md` (mirror); `tests/skill-ownership.test.mjs` (new file). No change to `scripts/build-manifest.mjs`, no change to `bin/cli.js`, no change to `obj/template/`.
- **Rollback**: revert frontmatter additions; delete the audit check function. Surgical.

## Candidate B — Extend `obj/template/manifest.json` with an `owners` block

- **Summary**: Keep the existing manifest format and add a sibling top-level key. The build manifest becomes `{ manifest_version, generated_at, files: {...}, owners: { skills: { "<slug>": "baseline", ... } } }`. The CLI continues to write this manifest into `<target>/.claude/.baseline-manifest.json` verbatim. SKILL.md still declares `owner: baseline | user` in frontmatter (the build reads it to populate `owners.skills`). The audit cross-checks frontmatter on disk against the `owners.skills` map in the shipped manifest.
- **API references (current)**:
  - `node:crypto.createHash` — same as A.
  - `node:fs/promises.readdir`, `readFile` — already used in `build-manifest.mjs`.
  - `manifest_version` bumps from `1` to `2` so older `doctor`/`--merge` paths can detect the new shape. `bin/cli.js:194` already loads the manifest; the merge logic must tolerate v2 (treat unknown keys as opaque).
- **Fits**: yes — extends an existing artifact instead of multiplying artifacts. Matches the scout's flagged risk ("Two-manifest risk… spinning up a parallel `baseline.lock.json` is a code-debt magnet").
- **Tests it enables**:
  - All from Candidate A.
  - AC4: tamper a baseline SKILL.md without regenerating the manifest → `files.<path>` hash mismatch detected by the audit (which now reads `obj/template/manifest.json` and compares per-file hashes against disk).
  - AC8: deterministic re-runs produce byte-identical `manifest.json`.
  - AC9: removing a baseline skill listed in `owners.skills` → audit reports "baseline skill missing".
  - Migration-compatibility test: a target repo with a `manifest_version: 1` manifest still works for `doctor`/`--merge`; `manifest_version: 2` shipped going forward.
- **Tradeoffs**:
  - **Pro**: single source of truth for shipped-file hashes AND skill provenance. No new on-disk artifact, no new shipped-path. `template-payload.test.mjs` ALLOWED_PREFIXES needs no change.
  - **Pro**: `doctor` and `--merge` immediately get awareness of baseline-skill provenance for free (an upgrade-aware merge could prefer `owner: user` directories' on-disk versions over the manifest's expected hashes).
  - **Pro**: `EXPECTED_SKILLS` (audit.sh:48-67) deletes cleanly — the canonical list is `manifest.owners.skills`, derived at build time from frontmatter.
  - **Con**: `manifest_version` bump is a breaking-shape change for any external consumer reading the manifest (in practice: only `bin/cli.js`, `doctor`, and the existing manifest tests in this repo — the CLI is not yet npm-published, so this window is unusually safe).
  - **Con**: `obj/template/manifest.json` is regenerated each build; the audit either reads the *committed-but-gitignored* `obj/template/manifest.json` (must `npm run build` first) or duplicates the build step. Today's audit already reads `obj/template/manifest.json` in spirit (it runs as Stage 0 of `build-template.sh`); the new check just reads it earlier.
  - **Con**: ties skill provenance to the build pipeline. Users who run audit without first building won't have a fresh manifest. Mitigation: `audit-baseline` can rebuild via `node scripts/build-manifest.mjs obj/template` if missing — but that requires `obj/template/` to be populated, which it won't be on a fresh clone before `npm run build`.
- **Files touched**: 36× SKILL.md (frontmatter add); `scripts/build-manifest.mjs` (read frontmatter, populate `owners.skills`, bump `manifest_version`); `.claude/skills/audit-baseline/audit.sh` (read manifest, cross-check disk); `bin/cli.js` (tolerate v2 manifest, treat unknown keys opaque); `tests/manifest.test.mjs` (extend for v2 shape); `tests/doctor.test.mjs` (extend for `owners` field); `tests/skill-ownership.test.mjs` (new); `docs/init/seed.md` §4.3; `CLAUDE.md` (one new sub-article); `src/CLAUDE.template.md` (mirror). No new on-disk artifact at the user's target beyond what's already there.
- **Rollback**: revert manifest schema bump (v2 → v1); revert frontmatter; targets installed during the broken window can be migrated by running the doctor against a fresh `--merge`. Reversible but with a wider surface than A.

## Candidate C — Ship a separate `.claude/baseline.lock.json` focused on skill provenance

- **Summary**: Keep `obj/template/manifest.json` and `.baseline-manifest.json` exactly as-is (whole-tree sha256 table). Add a *second* JSON artifact, `.claude/baseline.lock.json`, that is skill-focused: `{ lock_version: 1, generated_at, skills: { "<slug>": { owner: "baseline", sha256: "<merkle hash of every file under <slug>/>", files: { "SKILL.md": "<sha>", "references/foo.md": "<sha>", ... } } } }`. Built by a new `scripts/build-skill-lock.mjs`, shipped inside `obj/template/.claude/baseline.lock.json`. SKILL.md still declares `owner: baseline | user`. The audit reads the lock and validates per-skill drift.
- **API references (current)**:
  - `node:crypto.createHash` — same as A.
  - `node:fs/promises.readdir` (recursive `{ withFileTypes: true }`) — Node 18+, used in `build-manifest.mjs:13`.
- **Fits**: partially — adds a new shipped artifact, but it is purpose-built for skill provenance and does not muddy the existing manifest. Matches the original intake's intent literally. Risks the "two-manifest" anti-pattern the scout warned about — but cleanly partitions roles ("manifest = every file; lock = skill provenance and per-skill aggregate hash").
- **Tests it enables**:
  - All ACs from intake, including AC4 (per-skill `sha256` aggregate hash detects body-content drift in any file under `<slug>/`).
  - AC5: a new directory with `owner: user` is not in the lock → audit ignores it.
  - AC8: deterministic builds.
  - AC9: lock entry without a matching directory → "baseline skill missing".
- **Tradeoffs**:
  - **Pro**: hash scope is explicitly per-skill (covers `references/`, helper scripts, `template.md`, `SCENARIO.md`). Tampering with a sibling file of any baseline skill is detected.
  - **Pro**: lock format is independent of the build manifest, so future `npx create-baseline upgrade` can consume it without coupling to whole-tree hashing.
  - **Pro**: no `manifest_version` bump, no `bin/cli.js` schema change. Existing target installs keep working unchanged.
  - **Con**: two-manifest reality. Both `.baseline-manifest.json` and `baseline.lock.json` will hash the same SKILL.md content (different aggregations, but overlapping bytes). Future maintenance must update both surfaces.
  - **Con**: needs a new entry in `tests/template-payload.test.mjs`'s ALLOWED_PREFIXES (scout-flagged landmine).
  - **Con**: the per-skill aggregate hash needs a canonical merkle definition — sort sibling files lex, hash each, concatenate hashes in sorted order, hash the concatenation. Easy to get wrong on first write (e.g., trailing newlines, path-separator differences).
- **Files touched**: 36× SKILL.md (frontmatter add); new `scripts/build-skill-lock.mjs`; `scripts/build-template.sh` (call the new builder as Stage 3.5); `.claude/skills/audit-baseline/audit.sh` (new lock-reading check); `tests/template-payload.test.mjs` (allowlist the lock path); `tests/skill-ownership.test.mjs` (new); `docs/init/seed.md` §4.3 + `CLAUDE.md` (cite the lock by path); `src/CLAUDE.template.md` (mirror). No `manifest.json` shape change.
- **Rollback**: delete `baseline.lock.json` from `obj/template/`; remove the audit check; revert frontmatter. Wider surface than A, narrower than B (no schema bump).

## Cross-cutting answers (constant across A/B/C)

These are independent of which storage path the spec picks. Calling them out so `/spec` does not re-litigate:

- **Canonical baseline-skill list**: in A and B, the canonical list is the union of `{ slug | SKILL.md has owner: baseline }` (B reflects this into `manifest.owners.skills`). In C, the canonical list is `baseline.lock.json.skills` (still derived from frontmatter at build time). In all three, `EXPECTED_SKILLS` (audit.sh:48-67) is deleted — it is duplicate state. The audit's new check is "every disk slug with `owner: baseline` is in the canonical source, and vice versa".
- **Frontmatter placement**: put `owner:` directly after `name:`. Three baseline skills today carry no key between `name:` and `description:` (sample: intake, chore, scout); two carry `argument-hint:` between description and `---`. Inserting `owner:` after `name:` is the least-friction position and gives every audit a stable line to grep.
- **Migration tactic**: manual edits, inside this workflow's `/tdd` or swarm-dispatch phase. 36 files × one-line addition is bounded. A migration script is YAGNI given (a) the count is small and bounded and (b) every edit is a hand-reviewed governance change. The swarm-plan can shard the 36 across waves by skill category (artifact, phases, workers, helpers, orchestration, globals, audit, alt) — the categories themselves are already pairwise-disjoint write sets per `seed.md` §4.3.
- **Constitutional placement**: new Article XI in `CLAUDE.md` (and parallel new §17 in `seed.md` or extension of §4.3). Article IX is project memory — adding skill provenance to it would conflate two domains. Article VIII gains one new audit row referencing the lock/manifest depending on candidate. The `src/CLAUDE.template.md` mirror must be updated in the same commit to keep `template-drift.test.mjs` passing.

## Recommendation

**Candidate B — extend `obj/template/manifest.json` with an `owners` block, bump `manifest_version` to 2** — because the codebase already has a working build-time + target-side manifest pair (`obj/template/manifest.json` and `.claude/.baseline-manifest.json`), and adding the `owners.skills` map to it is the single change that satisfies every intake AC (including AC4 hash-mismatch detection and AC8 determinism) without introducing the two-source-of-truth maintenance burden the scout flagged.

**What would flip the decision to A**: if the spec audit decides hash-mismatch detection (AC4) is out of scope and that frontmatter-only detection of *presence* drift is enough. Then Candidate A is materially simpler and avoids the `manifest_version` bump.

**What would flip the decision to C**: if `bin/cli.js`'s manifest loader cannot tolerate unknown top-level keys without code change, and that change is judged riskier than shipping a parallel `baseline.lock.json`. Reading `bin/cli.js` at line 194 (loadManifest), the loader passes the parsed JSON through opaquely — risk is low but should be confirmed during /spec.

## Open questions

- Should the audit *require* a freshly built `obj/template/manifest.json` (Candidate B/C), or should it derive provenance directly from on-disk frontmatter and only consult the manifest opportunistically? Coupling audit to build creates a chicken-and-egg in CI where audit runs before build.
- Does the per-skill aggregate hash (Candidate C only) need to include the directory listing itself, or just the file contents? If a new empty file is added to a baseline skill directory, should that count as drift? Intake position: yes (a new file is drift), so the aggregate must hash the sorted list of paths in addition to the contents.
- Should `bin/cli.js doctor` learn about `owners.skills` (Candidate B) to surface a user-friendly "you modified 3 baseline skills" message? This is upgrade-flavored functionality and may belong in the deferred `upgrade` subcommand instead.
- Article placement: is XI the right number, or should `seed.md` §4.3 (Skills) absorb the provenance rule and `CLAUDE.md` add it to Article IX as a new sub-rule (rejected here as conflating memory with skill provenance)? The intake's "new Article XI" is one defensible choice among two; `/spec` should commit.
