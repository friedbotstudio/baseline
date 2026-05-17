# Codebase Scout Report — changelog-skill-and-responsive-svgs

Scoping the codebase slice that the new `changelog` skill, the Article IV phase-ordering amendment, the website narrative refresh, and the SVG bento-grid redesign all touch. Read-only scout per Phase 2.

## Primary touchpoints

### A. Commit-chain phase ordering surface

- `.claude/skills/commit/SKILL.md:8` — the prereq line: *"BOTH `archive` AND `memory-flush` in `completed` AND a valid consent token at `.claude/state/commit_consent`"*. The new phase grows this to a three-way AND (`archive` + `memory-flush` + `changelog`). Already pinned in `landmarks.md:217`.
- `.claude/skills/commit/SKILL.md:20` — Step 6 stamps `source_backlog_keys` via `sweep.py --mode stamp-closure`. Already the pattern for "commit invokes a sweep helper" — the new changelog skill can mirror the shape (commit invokes the new skill OR harness inlines a task between gate C and commit).
- `.claude/hooks/git_commit_guard.mjs:1` — Bash leg + Write leg. Branch-aware policy + forbidden-flag hard-blocks. **Does NOT need to know about the changelog phase** — the existing `commit_consent` token continues to authorize both phases; no new consent gate. Already pinned in `landmarks.md:194`.
- `.claude/hooks/lib/common.mjs:1` — Node ESM helpers (`readPayload`, `payloadGet`, `projectGet`, marker validation). The changelog skill might shell out via Bash; if it ports to Node hooks it'd import this. Already pinned in `landmarks.md:186`.
- `.claude/skills/harness/SKILL.md` — already pinned in `landmarks.md:60`. The 11-phase pipeline diagram-in-code lives at **lines 145-150** (the fenced `intake → scout → … → commit` block); a new row goes between `/grant-commit` and `commit`. Also the resume-state-machine table needs a row for "completed contains grant-commit but no changelog stamp yet".
- `.claude/skills/triage/SKILL.md` — already pinned in `landmarks.md:109`. **Task-seeding templates** (Step 5 of triage SKILL.md): four templates (`chore`, `tdd`-entry, `spec`-entry, `intake`-entry). Each non-chore template needs a new task row between `Wait for /grant-commit` and `Run /commit`. Chore template needs a decision: does chore also run `/changelog`? Defaulting to yes keeps consistency.

### B. Constitution + genesis byte-mirror surface

- `CLAUDE.md:60-89` — **Article IV phase table** (rows 1–11) + the rules underneath. The new phase row goes between current rows 10.6 (memory-flush) and 11 (Grant commit + commit). Two design candidates:
  - Split current row 11 into 11 (gate C) + 11a (changelog) + 11b (commit). Cleanest semantic, but changes phase numbering for everyone.
  - Keep row 11 unified and grow its description: *"Grant commit (gate C) → changelog → commit"*. Less precise but zero downstream renumbering. Spec to decide.
- `CLAUDE.md:185-208` — **Article VIII hook table**, 22 rows. Whether this grows depends on OQ#11 of the intake (do we need a hook to enforce "no commit without changelog"?). If yes: new PreToolUse Bash hook that blocks `git commit` unless `changelog` is in `completed`. If no (likely): the existing `commit/SKILL.md` prereq + harness task-seeding suffice.
- `CLAUDE.md:Article XI` — **Skill manifest article** (mentions "36 baseline-owned skills" → bumps to 37 if a new skill ships). The article body doesn't enumerate; the count is implicit through manifest.owners.skills. The Article itself doesn't change; the manifest does (auto-generated).
- `src/CLAUDE.template.md:1` — byte-mirror of CLAUDE.md (both files are **338 lines** today, confirmed equal). **Every edit to CLAUDE.md needs a parallel edit here**. Audit checks the X.2 mirror at `audit.sh:625`. Already pinned in `landmarks.md:102`.
- `docs/init/seed.md` — 676 lines. The phase enumeration lives in the workflow contract section (likely §3 or §4). Hooks list is §4.1 (line ~120-140); skills list is §4.3. Counts are extracted by `audit.sh:172-180` via regex (e.g. `"(seventeen .sh scripts total)"`). **Word-form numbers** matter — "thirty-six skills" → "thirty-seven skills" if new skill ships.
- `src/seed.template.md:1` — **600 lines, DRIFTED from seed.md** (76-line gap). Already-pinned backlog entry: `seed-template-md-pre-redesign-drift-a1f3` flags this as out-of-scope for this workflow but worth knowing — the byte-mirror invariant is broken today, and this workflow's edits should keep it from getting worse. Already pinned in `landmarks.md:95`. **The Article XI mirror is fine** (audit passes); the drift is structural framing, not Article XI surface.
- `.claude/skills/audit-baseline/audit.sh:1` — exhaustively inspected during scout. Key tripwires for this workflow:
  - `EXPECTED_HOOKS` set (lines 31-46): hardcoded 22-name set. **Edit needed only if a new hook ships.**
  - `EXPECTED_COMMANDS` (line 76): 5-name set. **No change** — changelog is a skill, not a command.
  - Headline count claims sweep (lines 654-845): scans CLAUDE.md, README.md, seed.md for `<n> hooks`, `<n> skills`, `<n> subagents`. If skill count moves 36→37, **every "thirty-six skills" / "36 skills" in those three docs flips to "thirty-seven" / "37"**. Also covered by Layer 2 context classifier.
  - Article XI + §17 citation check (line 276): `## Article XI` present in CLAUDE.md + `## §17` in seed.md. **Preserved invariant** — don't accidentally remove these headings.
  - Article X.2 mirror check (line 615): `### X.2 Design-task routing` in both `CLAUDE.md` AND `src/CLAUDE.template.md`. **Preserved invariant** — both mirrors must keep the heading.
  - Skill ownership: manifest-driven via `obj/template/manifest.json → owners.skills`. **A new skill auto-flows once `npm run build` regenerates the manifest** — no audit.sh edit needed.
  Already pinned in `landmarks.md:67`.

### C. The new-skill surface itself

- `.claude/skills/memory-flush/SKILL.md` — already pinned in `landmarks.md:225`. **Best template neighbor** for the new skill — it's also a stateless-ish helper that runs at a precise workflow point (Phase 10.6) and shells out to a `.py` actuator (`sweep.py`). Frontmatter shape: `name:`, `owner: baseline`, `description:`, `argument-hint?:` then body. The new `changelog` skill SHALL declare `owner: baseline` (Article XI; no audit fail).
- `scripts/build-manifest.mjs:32-65` — reads `owner:` frontmatter from every `.claude/skills/<slug>/SKILL.md`, emits `manifest.owners.skills` as a slug→`baseline` map. **A new skill at `.claude/skills/changelog/` with `owner: baseline` flows through automatically on `npm run build` / `npm run prepack`** (no script edit needed).
- `obj/template/manifest.json` — auto-generated; consumed by `.claude/.baseline-manifest.json` at install (mirrored verbatim per Article XI). Also consumed by `audit.sh:217-226` for the "skills names match" check.
- `.releaserc.json:6-18` — `@semantic-release/commit-analyzer` with custom `releaseRules`. `@semantic-release/changelog` (line 20) is the plugin that **writes `CHANGELOG.md` at release time** by concatenating commit-message-derived entries. This stays unchanged. The new local-skill produces per-commit content that semantic-release later sees.
- `CHANGELOG.md:1-60` — current shape: `### Features` / `### Bug Fixes` / `### BREAKING CHANGES` / `### chore` headings under each `# [version]` block. **NOT formal keepachangelog 1.0.0** — keepachangelog mandates `Added / Changed / Deprecated / Removed / Fixed / Security`. The new skill's fragment should match keepachangelog's exact section names; that's a register choice the spec resolves (Open question 1 of the intake).
- `package.json:48` — `@semantic-release/changelog: 6.0.3` pinned. **Version pin needs context7 query in `/research`** to confirm current API.
- `scripts/publish-check.sh`, `scripts/smoke-tarball.mjs` — release-time scripts; **do not touch CHANGELOG.md generation**. Out of scope.

### D. Website + SVG surface (BIG FINDING)

- **The architecture SVG is INLINE in `site-src/index.njk:180-259`**, NOT a separate `.svg` asset. There is exactly **one** standalone `.svg` in the repo (`.github/assets/logo-baseline.svg`) and it's the GitHub social-share logo, unrelated. The SVG to redesign is a Nunjucks-templated inline `<svg>` element.
- Current inline SVG dimensions: `viewBox="0 0 940 200"`. Linear flowchart with 11 nodes on a horizontal axis at `x ∈ {40, 124, 208, 292, ..., 880}` (84px spacing). Gate A `/approve-spec` annotated at `x=376` (inline rectangle + check glyph + "USER-TYPED" tag). Gate C `/grant-commit` at `x=880`. Gate D `/grant-push` rendered BELOW the axis at `y=150-194` as a runtime gate (dashed bracket, distinct visual treatment).
- Current SVG is **viewBox-responsive** (scales proportionally) but NOT bento-grid. At 320px wide: `200/940*320 ≈ 68px` tall — text labels scale down with the viewBox; legibility at 320px depends on CSS font-size in `site-src/assets/site.css` (not yet inspected — `/research` should confirm).
- Per-page hero SVGs live at `site-src/_includes/hero-symbols/*.njk` (cli, hooks, install, memory, skills, swarm — six heroes). **These also need responsive audit** per intake AC6/AC7.
- `site-src/_data/baseline.json` — **structured count source** for the website:
  ```
  hooks: { total: 22 }
  skills: { total: 36, ... }
  phases: 11, gates: 4, phaseGates: 3, runtimeGates: 1
  ```
  **If "changelog" counts as a new phase: `phases` bumps to 12; `phaseGates` stays at 3** (no new gate). Templates that pull from this JSON inherit the count automatically.
- `site-src/index.njk:103` — *"three workflow-phase consent gates"* prose. Unaffected if no new gate.
- `site-src/index.njk:177` — *"One pipeline, request to commit"* lede prose. The "request to commit" framing absorbs the new phase without rewording.
- `site-src/install.njk:36` — mentions Phase 11 + `/grant-commit + /commit`. **Needs touch** if phase numbering changes; if phase 11 stays unified, no edit.
- `site-src/skills/core.njk:60` — describes the `commit` skill. **Likely needs a sibling `changelog` row** + a mention of the new ordering.
- `site-src/hooks.njk:87,98` — describes consent_gate_grant + the 4 slash commands. **Likely unaffected** (no new gate).
- `site-src/memory.njk:188` — describes Phase 10.6 ordering relative to /grant-commit. **Needs sibling sentence** for the changelog phase.

### E. Auxiliary context

- `.claude/memory/landmarks.md:271-277` — `.claude/memory/backlog.md:1` landmark entry (the canonical-file definition). Confirms the source-backlog entry's shape; no edit needed.
- `.claude/memory/backlog.md:setup-changelog-tracker-for-unpushed-commits-f22a` — source ticket. Verbatim (already captured in workflow.json):
  > let's add another item in backlog to setup a changelog tracker
- `.claude/memory/backlog.md:commit-consent-ttl-too-tight-for-humanizer-flow-8917` — adjacent ticket. **Listed as a non-goal in the intake** but worth knowing — the new skill must complete inside the 300s `commit_ttl_seconds` window or the TTL ticket's cure becomes load-bearing.

## Entry points that reach this code

- `/grant-commit` slash command → `consent_gate_grant.mjs` writes `.commit_consent_grant` marker → command body writes `.claude/state/commit_consent` token (gated by `git_commit_guard.mjs` Write-leg). **Entry point for the new phase's authorization** (no new consent gesture).
- `/harness` slash command (Skill) → iterates `.claude/state/workflow.json` → invokes phase skills in order. **Entry point for the new phase's automation** — harness will be re-seeded to include a `Run /changelog` task between `Wait for /grant-commit` and `Run /commit`.
- `/commit` slash command (Skill) → reads workflow.json prereqs → stages + commits. **Currently the only post-archive step**; the new phase precedes it.
- `npm run build` (`scripts/build-template.sh` → `scripts/build-manifest.mjs`) → regenerates `obj/template/manifest.json`. **Entry point for skill registration** — a new `.claude/skills/changelog/SKILL.md` with `owner: baseline` is picked up here.
- `.releaserc.json` plugin chain on push to main → `@semantic-release/changelog` reads commit history → writes `CHANGELOG.md`. **Downstream consumer** of whatever the new skill produces (commits with keepachangelog-shaped bodies feed cleaner CHANGELOG.md sections).

## Existing tests

- `.claude/skills/audit-baseline/audit.sh` — drift check, runs as `npm test`. **Will exercise the new phase's audit-shape invariants** (skill count, byte-mirror, Article XI/§17 citations). Already pinned in `landmarks.md:67`.
- `.claude/hooks/tests/` — bash test suites for every hook. **No new hook expected**, so no new test file expected; existing tests stay green.
- `.claude/skills/memory-flush/tests/run.sh` — pattern for skill-level tests; the new skill SHALL ship analogous `.claude/skills/changelog/tests/run.sh` with fixture-based integration tests. Already pinned in `landmarks.md:165`.
- `.claude/skills/audit-baseline/tests/preamble_check_test.sh` — pattern for fixture-based tests using tempdir + `CLAUDE_PROJECT_DIR` redirect. **The changelog skill's tests SHOULD reuse this pattern.** Already pinned in `landmarks.md:249`.
- **No existing Playwright snapshot tests for the SVG** — only the GitHub Actions release workflow + the publish-check.sh script reach the rendered site. The SVG redesign carries low test-regression risk but high visual-regression risk; a manual Playwright snapshot at three viewport widths (320/768/1920) is the right verifier.

## Constraints and co-changes

- **Byte-mirror lockstep**: every edit to `CLAUDE.md` → matching edit to `src/CLAUDE.template.md`. Audit fails otherwise (line 627). Same for `docs/init/seed.md` → `src/seed.template.md` (though that mirror is already drifted — out of scope to fix here, but stay neutral).
- **Word-form number lockstep**: any "thirty-six skills" / "thirty-seven skills" change in CLAUDE.md must also flip in seed.md AND README.md (headline-count-claim sweep at `audit.sh:756`).
- **Hook count is unchanged** if no new hook lands. Watch the seed.md `(seventeen .sh scripts total)` phrasing (`audit.sh:172`) — that's the brittle anchor. If a hook IS added, this becomes "eighteen .sh scripts total" + every hook table row count grows + Article VIII grows a row + src/settings.template.json wires the new hook.
- **`site-src/_data/baseline.json` is the structured count source.** Bumping `phases: 11 → 12` cascades through templates that read it.
- **`obj/template/manifest.json` is auto-generated.** Do NOT hand-edit; run `npm run build` after the skill lands.
- **TTL constraint**: the new skill plus `/commit`'s humanizer pass must fit inside `consent.commit_ttl_seconds` (default 300s). Backlog entry `commit-consent-ttl-too-tight-for-humanizer-flow-8917` already flagged the TTL is tight today. **Watch the design choice** — a slow changelog skill will eat the window.
- **`@semantic-release/changelog: 6.0.3` is pinned in package.json.** `/research` should context7-query its current API to verify that its concatenation behavior preserves keepachangelog sections from commit-message bodies.
- **Article X.1 em-dash ban** applies to ALL `site-src/**` user-facing prose added in `/document` (Phase 10). This intake, the spec, the CLAUDE.md amendment, and the SKILL.md body are exempt.

## Patterns in use here

- **Phase skills are thin coordinators that shell out to actuators.** `memory-flush/SKILL.md` is the canonical shape — the SKILL.md describes the SOP; `sweep.py` is the deterministic doer. The new `changelog` skill SHOULD ship a similar pair: `SKILL.md` (decisions, ordering) + an actuator (likely `.mjs` per the JS-port direction in `backlog.md → migrate-bash-python-heredocs-to-javascript-d454`).
- **Skill ownership = `owner: baseline` frontmatter.** Auto-flows through build-manifest.mjs → audit.sh skill-name check. No hand-list anywhere.
- **State files live at `.claude/state/<area>/<slug>.<ext>`.** Existing precedents: `spec_approvals/`, `swarm_approvals/`, `swarm/`, `drift/`, `harness/`, `tdd/`, `design/`. **If the new skill needs durable state**, it lives at `.claude/state/changelog/<slug>.json` (intake OQ#5 → likely yes for the projected-version preview).
- **Source-backlog stamp-closure** (`commit/SKILL.md:20`): the canonical pattern for "a phase reads `workflow.json → <field>` and invokes a helper". The new skill MAY consume `workflow.json → source_backlog_keys` for its fragment-body suggestion (this workflow's commit will pick up `setup-changelog-tracker-for-unpushed-commits-f22a` — the fragment should reference it).
- **SVG idioms in `site-src/index.njk`**: inline `<svg>`, `viewBox` for scaling, `<g class="gate-anno">` for grouped annotations, CSS classes (`.node-circle`, `.axis`, `.gate-tag`, etc.) defined in `site-src/assets/site.css` (not yet inspected — `/design-ui` will). Embedded `<title>` for a11y.
- **Hero SVGs are per-page Nunjucks includes** at `site-src/_includes/hero-symbols/`. The bento-grid redesign may either (a) apply to the index.njk architecture SVG only, OR (b) extend to the hero family. Intake AC7 names only the architecture SVG; AC6 names "the SVG" (singular) — but mobile-responsive applies to all six heroes too. `/design-ui` to scope.

## Risks / landmines

- **Phase numbering churn risk.** If the spec elects to split Phase 11 into 11/11a/11b, every doc/site mention of "11 phases" stays correct but every mention of "Phase 11" becomes ambiguous. Recommend keeping Phase 11 unified and naming the new step "Phase 11.5 — Changelog" inside the row description, mirroring the existing pattern for `archive (Phase 10.5)` / `memory-flush (Phase 10.6)`.
- **`src/seed.template.md` is drifted (76 lines) from `docs/init/seed.md`.** The drift predates this workflow (`seed-template-md-pre-redesign-drift-a1f3` in `backlog.md`). **Do not let this workflow's seed.md edits accidentally narrow OR widen that drift** without explicit decision. Safest: edit both files in parallel for whatever this workflow touches, and leave the historical drift alone.
- **`commit-consent-ttl-too-tight-for-humanizer-flow-8917`** — if the changelog skill takes longer than ~60s on average, the cumulative time from `/grant-commit` to actual `git commit` blows the 300s window more often. **Mitigation**: design the skill to be fast (< 5s typical) — likely a small Node helper, no external API calls except a possible local `semantic-release --dry-run` (which itself takes 2-3s).
- **SVG redesign may invalidate the page's lead diagram caption** at `index.njk:260` (*"Eleven phases, four gates."*). If the redesign visually represents 12 phases-slash-substeps, the caption needs a rewrite. Article X.1 em-dash ban applies to the caption text.
- **The `@semantic-release/changelog` plugin auto-stages `CHANGELOG.md` at release time.** If the new local skill also writes `CHANGELOG.md` per-commit, the two writers need to agree on conflict resolution. Cleanest: the local skill writes to a section above `# [version]` headings (the Unreleased section per keepachangelog 1.0.0), and `@semantic-release/changelog` cuts that section into a numbered release at publish time. **Spec to confirm this is what the plugin actually does** — Plugin docs say it inserts release notes ABOVE the previous entry; the keepachangelog Unreleased pattern should coexist.
- **The intake's "no new consent gate" constraint** depends on the existing `/grant-commit` token's TTL covering both the changelog skill AND the commit skill. Confirmed safe per the analysis above — but enforce via design (skill must be fast).
- **No Playwright snapshot test exists for the SVG.** Regression risk is visual-only and only caught by human review. **Suggest the spec authorize a Playwright snapshot test at 320/768/1920px** as part of the integrate-phase verification surface.
- **The changelog skill is bootstrap-sensitive.** This workflow's OWN `/commit` runs the OLD chain (changelog skill doesn't exist on disk yet during this workflow's archive→commit window). Document this in the spec so future readers don't get confused.
