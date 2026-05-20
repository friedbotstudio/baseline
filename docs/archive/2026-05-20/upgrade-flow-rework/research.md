# Pattern Research — upgrade-flow-rework

This memo evaluates the three highest-leverage design decisions the spec will commit to. Library APIs verified against `@clack/prompts@1.4.0` and `npm/cli` via context7. `git merge-file` behavior cited from the standard git toolchain (POSIX); no context7 needed because the tool ships with every git installation and the flag surface has been stable since git 1.6.

## Decision 1 — BASE content recovery strategy

The current `.baseline-manifest.json` stores sha256 hashes only; without BASE *content*, `git merge-file --diff3 LOCAL BASE REMOTE` cannot run. Three candidates.

### Candidate 1A — npm-only re-fetch on demand
- **Summary**: At upgrade time, look up the previously-installed baseline version (a new `baseline_version` field on the installed manifest) and fetch the prior version's tarball from the npm registry. Verify by re-hashing each file against `oldManifest.files` and refusing the merge if any file's sha256 doesn't match.
- **API references (current)**:
  - `npm@latest` — programmatic `libnpmpack` API: `const tar = await pack('@friedbotstudio/create-baseline@0.4.0')` returns a Buffer. Source: `npm/cli` libnpmpack README via context7.
  - `npm@latest` — CLI fallback: `npm pack @friedbotstudio/create-baseline@0.4.0 --pack-destination <dir>` writes the tarball to disk.
  - `npm@latest` — cache hints: `--prefer-offline`, `--offline`, `--prefer-online` honored by all of `npm install`, `npm pack`, `npm view`.
- **Fits**: yes — every consumer who installed via `npx @friedbotstudio/create-baseline` already has npm available. Scout confirmed no existing cache logic to displace.
- **Tests it enables**: integration tests that mock the registry response (Node test runner has `import { setupServer } from 'msw'` patterns, or simpler: feed a local `.tgz` file via an injected `pack` function).
- **Tradeoffs**:
  - **(+)** Zero ongoing disk cost on the user's machine. Tarballs land in `os.tmpdir()` and clean up at upgrade end.
  - **(+)** Always-current source — if a baseline version is patched and re-published with the same version (unusual but possible), the user gets the patched content.
  - **(-)** Requires network at upgrade time. Offline upgrades become impossible for any file that needs BASE.
  - **(-)** Adds runtime dependency on the npm registry — a yanked prior version breaks the merge (graceful fallback to tier-1 binary prompt needed; intake AC 8 covers this).
  - **(-)** Supply-chain surface: a compromised registry could serve a different artifact. Mitigation: verify re-fetched files against `oldManifest.files` sha256s and refuse the merge on any mismatch.
  - **(-)** First-rework cold start: legacy manifests (`manifest_version: 1`) have no `baseline_version` field. Either fall back to tier-1 binary prompt for one upgrade cycle, or try a sha256-reverse-lookup against published versions (slow + bandwidth-heavy).

### Candidate 1B — local BASE cache at install time
- **Summary**: Every fresh install and every successful upgrade copies the current baseline content to `.claude/.baseline-prior/` (bounded to exactly one version's worth). On subsequent upgrade, the BASE for any file is the matching path under `.baseline-prior/`. No network round-trip at upgrade time.
- **API references (current)**: no third-party APIs needed — uses `node:fs/promises` `cp()` recursively, same as the existing `freshInstall()` flow in `src/cli/install.js`.
- **Fits**: yes — mirrors the existing `.baseline-manifest.json` pattern of "stash a copy of relevant install state next to the manifest". `.claude/.baseline-prior/` follows the same `.baseline-*` dotfile convention.
- **Tests it enables**: pure filesystem fixtures; the integration test seeds a fake `.claude/.baseline-prior/<rel>` tree, mutates the local file, runs upgrade, and asserts merged content. No network mock.
- **Tradeoffs**:
  - **(+)** Offline-correct by construction. Air-gapped upgrade works.
  - **(+)** Tamper-evident: cache content is sha256-checked against `oldManifest.files` on read; mismatched cache = treat as missing BASE (fall through to tier-1).
  - **(+)** No supply-chain dependency on the registry at upgrade time.
  - **(-)** Disk footprint: roughly doubles the baseline's tracked footprint inside `.claude/`. Scout's spot-check of `obj/template/.claude/manifest.json` lists ~80 files; today's full baseline payload is in the low single-digit MB range. Acceptable for the value gained.
  - **(-)** `.claude/.baseline-prior/` must be added to `.gitignore` (or, more correctly, declared a `NEVER_TOUCH`-equivalent that the consumer's git tree silently includes/excludes per preference).
  - **(-)** Legacy cold start: same problem as 1A — projects installed before this rework have no `.baseline-prior/`. First post-rework upgrade falls back to tier-1 binary prompt.
  - **(-)** Doubles the install-time disk writes (cp into `.baseline-prior/`). Cost is negligible (small file count, fast SSD), but tests asserting "install wrote exactly N files" would need updating.

### Candidate 1C — hybrid: local cache primary, npm re-fetch fallback
- **Summary**: Cache the immediately-prior version locally per 1B. When the cache is absent (legacy install, manually deleted, or upgrading across a version skip the cache doesn't cover), fall back to npm re-fetch per 1A. Single code path; cache short-circuits the network call when available.
- **API references (current)**: union of 1A + 1B above.
- **Fits**: yes — combines both patterns without conflict; the BASE resolver is one function with a two-case dispatch.
- **Tests it enables**: tests for both branches — cache-hit path uses filesystem fixture; cache-miss path mocks `libnpmpack`.
- **Tradeoffs**:
  - **(+)** Offline-fast in the common case; degrades gracefully when cache absent.
  - **(+)** Handles legacy cold-start: first upgrade has no cache, falls through to npm fetch, then writes the cache for next time.
  - **(+)** Resilient to single npm-yank: if the prior version was yanked AND the cache is intact, the upgrade still works.
  - **(-)** Two code paths to test, two failure modes to surface (cache corrupt vs network down vs both). Worth the cost given the resilience benefit.
  - **(-)** Slightly more complex BASE-resolver function; ~50 LOC instead of ~20.

### Recommendation
**Candidate 1C (hybrid).** The cache covers 95% of upgrades with zero network cost, the npm fallback handles legacy cold-starts and version-skip scenarios, and the failure modes are independently surfaceable. What would flip the decision: if `.claude/.baseline-prior/` materially bloats clone size for users with many projects (it shouldn't — single-digit MB per project), drop to 1A and accept the network dependency.

## Decision 2 — Staging file convention for tier-3 semantic merge

When tier-3 stages files for `/upgrade-project` to reconcile, where do the three states (LOCAL stays put; BASE + REMOTE staged) live?

### Candidate 2A — sibling files next to the local path
- **Summary**: `seed.md` (LOCAL untouched) gets `seed.md.baseline-base` + `seed.md.baseline-incoming` written alongside. `/upgrade-project` discovers staged files by walking the tree for `*.baseline-incoming`. Intake AC 4's initial proposal.
- **Fits**: partially — preserves the local file in place, but scatters staging artifacts throughout the tree.
- **Tradeoffs**:
  - **(+)** Maximally discoverable; a human running `git status` sees `seed.md.baseline-incoming` right next to the file that needs attention.
  - **(+)** Self-cleaning when `/upgrade-project` deletes the sibling files; no shared state file to keep in sync.
  - **(-)** Adds noise to `git status` and risk of accidental commits (`git add .` includes them).
  - **(-)** Requires per-file gitignore patterns (`*.baseline-incoming`, `*.baseline-base`) — every project that inherits the baseline needs these patterns added to `.gitignore` (or the baseline ships them).
  - **(-)** Discovery walks the whole tree — slower than reading a single state file.

### Candidate 2B — separate subdirectory mirroring the project tree
- **Summary**: All staging artifacts live under `.claude/upgrade-staging/<timestamp>/`, with paths mirroring the source. E.g., `seed.md` stages to `.claude/upgrade-staging/2026-05-20T14-49Z/docs/init/seed.md.{base,incoming}`. LOCAL stays put.
- **Fits**: yes — `.claude/` is the conventional spot for baseline runtime state; scout confirmed no hook watches this exact path.
- **Tradeoffs**:
  - **(+)** Single point of gitignore: `.claude/upgrade-staging/` rule covers everything.
  - **(+)** Idempotency check is trivial — list directories under `.claude/upgrade-staging/`; presence = pending stage.
  - **(+)** Multiple historical stages can coexist (different timestamps) if a user defers reconciliation.
  - **(-)** Discoverability: a user browsing the project tree doesn't see staging artifacts unless they look in `.claude/`. CLI terminal output mitigates by naming the files explicitly.
  - **(-)** Cleanup on partial failure needs care: `/upgrade-project` must delete the entire timestamped dir atomically (rename-then-rmdir).

### Candidate 2C — `.claude/state/upgrade/<timestamp>/` with a state manifest
- **Summary**: Same physical layout as 2B but lives under `.claude/state/` (the conventional spot for transient workflow state — harness markers, swarm state, etc.) and carries a `manifest.json` recording `{slug, baseline_version, files: [{path, base_hash, incoming_hash, local_hash, status}]}`. `/upgrade-project` reads the manifest to know what to reconcile and updates the manifest as it goes.
- **Fits**: yes — extends the existing `.claude/state/{spec_approvals,swarm_approvals,swarm,harness}/` pattern. Scout confirmed no hook watches `.claude/state/upgrade/` today.
- **Tradeoffs**:
  - **(+)** All advantages of 2B (single gitignore, atomic cleanup, idempotency).
  - **(+)** State manifest is the durable contract between the CLI (writer) and `/upgrade-project` (reader). Each side can be tested independently against the manifest schema.
  - **(+)** Per-file status tracking enables partial completion — `/upgrade-project` reconciles 3 of 5 files, the user investigates the remaining 2 manually, re-running the skill picks up where it left off.
  - **(+)** Aligns with the constitutional pattern in CLAUDE.md Article VIII (every transient workflow state lives under `.claude/state/`).
  - **(-)** Slightly more code than 2A or 2B (the manifest writer/reader). Worth it for the partial-completion behavior.

### Recommendation
**Candidate 2C (`.claude/state/upgrade/<timestamp>/` with a state manifest).** Aligns with the existing constitutional pattern, supports partial completion, and the state manifest is a natural test boundary. What would flip the decision: if the project owner wants staging artifacts to be human-discoverable in the tree (so a user who isn't paying attention to CLI output trips over them), revert to 2A — but the CLI terminal message naming the staged paths already covers that case for users who actually read CLI output.

## Decision 3 — Tier allowlist mechanism

Three tiers needed: **mechanical** (`git merge-file --diff3` candidate), **semantic** (`/upgrade-project` candidate), **binary-prompt** (tier-1 keep/replace, the existing default). How does the CLI know which tier a file belongs to?

### Candidate 3A — hardcoded frozen arrays in `src/cli/install.js`
- **Summary**: Mirror today's `NEVER_TOUCH` / `SPECIAL_MERGE` / `COPY_EXCLUDE` pattern. Add `MECHANICAL_MERGE = Object.freeze([...])` and `SEMANTIC_MERGE = Object.freeze([...])`. Membership is by exact relative path (or glob, parsed at module load).
- **Fits**: yes — preserves the existing pattern verbatim.
- **Tradeoffs**:
  - **(+)** Lowest implementation cost; one file edited, one import added per consumer.
  - **(+)** Allowlists are reviewable in PRs alongside the code that consumes them.
  - **(-)** Tier classification is invisible from the user-facing manifest. A consumer auditing "what tier is `CLAUDE.md` in?" has to read `src/cli/install.js` rather than `.claude/manifest.json`.
  - **(-)** Per-skill addition: if a future baseline-owned skill ships a special file that needs mechanical-merge, the allowlist needs updating alongside the skill code — two places to keep in sync.

### Candidate 3B — manifest-driven, per-file tier classification
- **Summary**: Extend `scripts/build-manifest.mjs` to assign a `tier` to every file (defaulting by extension/path heuristic, overridable by frontmatter for files that support it). Shipped manifest grows to `{files: {<rel>: {sha256, tier}}}`. CLI reads tier from the shipped manifest at upgrade time.
- **Fits**: partially — needs a manifest_version bump from 2 to 3; consumers reading the old shape get a graceful fallback (tier missing → infer by extension at read time).
- **Tradeoffs**:
  - **(+)** Tier classification is auditable from the shipped manifest. `jq '.files | to_entries | map(select(.value.tier == "semantic"))' .claude/manifest.json` returns every semantic-tier file.
  - **(+)** Per-skill correctness: a skill's `SKILL.md` (semantic) and its `template.md` (mechanical) can carry different tiers without touching `install.js`.
  - **(-)** Two places to specify: the build script's defaults + the frontmatter overrides. Slightly more complex than 3A.
  - **(-)** Manifest shape change requires updating `tests/manifest.test.mjs` + the audit script's manifest reader.
  - **(-)** Tier change happens at build time — a hotfix to "actually this file is semantic now" requires a rebuild + republish, not just a CLI patch.

### Candidate 3C — hybrid: extension-based defaults + frontmatter overrides + hardcoded special-case list
- **Summary**: Build-time defaults by extension: `.sh`/`.mjs`/`.js`/`.py`/`.ts` → mechanical; `.md` → semantic; everything else → binary-prompt. Plus a small hardcoded list in `src/cli/install.js` of explicit overrides for files that defy the defaults (`docs/init/seed.md` stays semantic — already covered by default; `.mcp.json` stays SPECIAL_MERGE — already covered today). Plus a frontmatter `tier:` field for `.md` files in skills/commands directories that want to override semantic → mechanical.
- **Fits**: yes — extension defaults cover ~95% of cases; the explicit list handles the special files; frontmatter handles the long tail.
- **Tradeoffs**:
  - **(+)** Zero per-file annotation needed for the common case.
  - **(+)** Special cases live where they're already conventionally specified (frontmatter for skills, hardcoded list for cross-cutting files).
  - **(+)** Easy to audit: `npm run build` outputs a tier-classified manifest; review the manifest diff to confirm tier assignments.
  - **(-)** Extension-based defaults have edge cases. `.json` is ambiguous (`project.json` is semantic; `package.json` is binary-prompt; `.mcp.json` is special-merge). The hardcoded list catches these but it's another moving piece.
  - **(-)** Three sources of tier classification (defaults, hardcoded overrides, frontmatter overrides) means three places to look when debugging "why is this file in tier X?".

### Recommendation
**Candidate 3B (manifest-driven, per-file tier classification, no per-file annotation needed for the common case).** Auditability from the shipped manifest is the deciding factor — Article XI established the manifest as the canonical record of baseline content, and tier classification is a natural extension. Use sensible defaults in the build script so most files don't need annotation; add explicit overrides via frontmatter for the small number that do. What would flip the decision: if test maintenance cost on `tests/manifest.test.mjs` proves prohibitive (it shouldn't — the manifest shape change is one new field per entry), fall back to 3A.

## Q5 — `/upgrade-project` fallback when LLM can't reconcile

Intake offered three options. **Recommendation: option (b) — leave the staging artifacts in place and ask the user a targeted question in conversation.** The skill returns a `needs_user_input` status, emits a clear question naming the file and the ambiguity, and exits. The user provides direction, the skill re-runs and proceeds. Rationale: the rework's whole point is that LLMs can do what `diff3` can't; when even the LLM is uncertain, the right move is conversational disambiguation, not an automated fallback that risks the wrong choice. Option (a) (write conflict markers like `diff3`) loses the partial work the LLM already did; option (c) (write a candidate, ask to confirm) is option (b) plus an unnecessary autonomy step.

## Q6 — `--dry-run` mode for `/upgrade-project`

**Recommendation: yes, opt-in via skill arg.** The skill accepts `args=dry-run` (or similar) which produces the reconciled content + a unified diff in the skill's output but does not write to LOCAL and does not delete staging artifacts. Rationale: first-time users of `/upgrade-project` will not yet trust the LLM's reconciliation. Showing the diff before committing builds that trust; once the user is comfortable, the dry-run flag stays available but isn't the default. Implementation cost is trivial — the skill already has the reconciled content in memory; the dry-run path just skips the write and writes the diff to the skill's terminal output instead.

## Open questions

- **`baseline_version` source.** Where does the *installed* manifest get the version string from? Read `package.json` at install time (most reliable for tarball-distributed packages) or read the shipped `obj/template/.claude/manifest.json → build_id` (CI-only, doesn't help local dev installs). Spec needs to settle this.
- **Tier-1 "Show diff" exit behavior.** After showing the diff and re-prompting, does picking "Show diff" again loop indefinitely? Recommended cap: after the second "Show diff" in a row, render the diff but skip the prompt (user clearly wants to read, not decide) and re-render the choice on the next file. Spec to confirm.
- **`/upgrade-project` Article XI / TOC reconciliation depth.** The intake's Article-XI example asks for renumbering + cross-reference fixing + TOC update. The spec needs to commit to *how* the skill recognizes a cross-reference (regex on "Article (Roman numeral)"? More general structural awareness?). Recommendation: start with the regex approach for the v1 of `/upgrade-project`; lift to structural awareness if the regex misses real cases in dogfooding.
- **`/upgrade-project` integration with the workflow harness.** Is `/upgrade-project` a workflow phase, or a standalone skill invokable any time? Recommendation: standalone, not a workflow phase — it's reactive maintenance work triggered by an external event (CLI staged files), not part of the 11-phase request → commit pipeline.
