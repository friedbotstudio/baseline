# Pattern Research — governance-count-single-source (WF-5)

Decision-focused memo. The work is internal architecture; the only library is eleventy (`@11ty/eleventy@3.1.5`, devDep), and scout already confirmed `_data/*.cjs` reads disk at build time (`site-src/_data/site.cjs` requires `../../package.json` and `fs`). No third-party API needs context7 — eleventy data-file behavior is the only framework surface, cited below from the in-repo precedent rather than recalled.

**Governing precedent (decisive for DP-1/DP-2):** `site-src/_data/site.cjs` was *itself* created to kill this exact bug class. Its header: *"Replaces the prior `site.json` (which carried a hardcoded 'v0' literal that drifted from package.json)."* It computes `version` from `package.json` at build time so the npm version and the rendered site can't disagree. WF-5 is the same move, applied to governance counts instead of the version string. Follow the established pattern.

---

## DP-1 — Single derivation source

### Candidate A: one shared deriver module, two consumers  ⭐ recommend
- **Summary**: Extract the disk-counting logic into `.claude/skills/audit-baseline/derive-counts.mjs` exporting `deriveCounts()` → `{ skills, hooks, commands, subagents, tracks: {canonical, subTracks}, memoryFiles, mcpServers }`. `audit.mjs` imports it (replacing its inline `diskBaseline*` derivation); the site's `_data/baseline` consumes it.
- **Fits**: Yes — `audit.mjs` already contains every counting primitive (`listDir`, `readSkillOwner`, `manifest.owners.skills`, the `addHooks`/`addSkills` project-additions filtering). This is an *extraction*, not new logic. Mirrors the `site.cjs`→`package.json` precedent.
- **Tests it enables**: a focused `tests/derive-counts.test.mjs` asserting each field equals the disk reality (no mocks — reads the real repo tree, the seed.md-permitted style); audit and site both observably consume the same numbers.
- **Tradeoffs**: One ESM/CJS interop wrinkle (below). The deriver becomes a baseline-owned file → manifest hash entry + `npm run build` after edits (Article XI), same as any `.claude` change.

### Candidate B: build-emitted `governance-counts.json`
- **Summary**: `build-template.sh` writes `obj/template/.claude/governance-counts.json`; audit + site read the JSON.
- **Fits**: Partial. Adds a build-ordering dependency: the audit would depend on a build artifact existing, but the audit is meant to run read-only any time (its header: *"safe to run any time, in CI"*). Today the audit derives live from disk; making it read a possibly-stale emitted JSON *reintroduces* a drift surface (the JSON itself can lag disk).
- **Tradeoffs**: Worse than A on the core goal — a generated file is one more thing that can be stale. Rejected.

### Candidate C: independent re-derivation (status quo + duplicate in site)
- **Summary**: Leave audit as-is; copy counting logic into the site data file.
- **Tradeoffs**: Two code paths to drift — the precise failure WF-5 exists to remove. Rejected.

**Recommendation: A.** What would flip it: if the deriver needed data only available post-build (it does not — every count is readable from the live `.claude/` tree and `.mcp.json`).

**ESM/CJS interop (the one real implementation wrinkle):** the deriver should be `.mjs` (matches `audit.mjs` and all `.claude` tooling; ESM `import` from audit is direct). Eleventy 3.x supports both ESM data files and async data files. Two viable site-consumer shapes:
- `site-src/_data/baseline.mjs` (ESM): `import { deriveCounts } from '...'; export default { ...deriveCounts(), ...wordForms }` — cleanest, but introduces the first `.mjs` data file (current ones are `.cjs`).
- `site-src/_data/baseline.cjs` (async CJS): `module.exports = async () => { const { deriveCounts } = await import('../../.claude/skills/audit-baseline/derive-counts.mjs'); return { ...deriveCounts(), ...wordForms }; }` — eleventy awaits exported functions; keeps the `.cjs` convention. Recommended for minimal divergence from the existing `_data` style.

This interop choice is mechanical (both work); the spec should name one. Not codesign-level.

---

## DP-2 — Site data: which fields derived vs static

- **Derive (numeric):** `hooks.total`, `skills.total`, `subagents.total`, `commands`, `tracks.canonical`, `tracks.subTracks`, `mcpServers` (new field) — all from `deriveCounts()`. `phases` and `gates` are *not* artifact counts on disk (phases are a workflow concept, gates are a policy constant) — keep them static literals in the data file, optionally asserted against `workflows.jsonl` node counts later (out of scope here).
- **Word-forms:** Derive them too, via a small `numToWord()` helper in the shared module covering the values in play (1,3,5,6,7,11,22,40 → one/three/five/six/seven/eleven/twenty-two/forty). Rationale: a static `mcpServersWord:"three"` sitting next to a derived `mcpServers:3` is the same drift risk in spelled-out clothing. `categoriesWord` ("twelve" = number of skill categories) and `sharedGlobalsWord` ("seven") derive from the category breakdown.
- **`skills.byCategory` breakdown:** category *assignment* is editorial (not mechanically inferable from disk), so keep it hand-authored — but add an audit assertion that `sum(byCategory) === skills.total`. This catches the most likely breakdown drift without trying to auto-classify skills.

**Net:** `baseline.json` becomes `baseline.{mjs,cjs}`; the stale `commands:5` disappears because the field is computed (→6). Every `{{ baseline.* }}` reference in the `.njk` files keeps working unchanged (eleventy keys data by filename).

---

## DP-3 — Per-surface treatment policy + the commands definition split

**Commands definition (resolve first):** canonical count = **6** = `.claude/commands/*.md` files (approve-spec, approve-swarm, grant-commit, grant-push, init-project, init-project-doctor). Rationale: `init-project-doctor.md` ships as its own command file and `CLAUDE.md:328` already says "6 commands"; the audit's `cmdsClaimed` regex already resolves seed's "one bootstrap + one doctor" phrasing to 6 and `checkCount('commands…')` currently PASSes against `diskCommands.size` (6). The only outlier is `baseline.json:commands:5`, which is simply **stale and must be corrected to 6** (automatically, once the field is derived). No reclassification needed; the disk is the truth and most surfaces already agree.

**Audit cross-check (extend `audit.mjs`, hard-FAIL):**
- Generalize the existing `findCount`/`checkCount` engine from "seed.md only" to a per-surface table. For each (file, regex, expected-count-kind), extract the literal (numeric or via the `WORDS` map) and `checkCount` against `deriveCounts()`.
- **Hard cross-check (FAIL on drift):**
  - `CLAUDE.md` + `src/CLAUDE.template.md` orientation line (`:328`): hooks/subagents/skills/commands/memoryFiles/mcpServers — the richest line, 6 counts, mirror pair.
  - `CLAUDE.md` + mirror Article III greeting (`:44`): hooks/subagent/skills.
  - `PRODUCT.md:40`: hooks/skills/subagent (the meta-strip that literally claims "verifiable from the codebase" — must be enforced).
  - `README.md:44`: hooks/skills/subagent/tracks/gates.
  - `seed.md` total ("twenty-two hook scripts total") — already covered; keep.
- **Best-effort / out of scope (do NOT hard-FAIL):** compound addend decompositions (`seed.md:14` "seventeen guards plus four lifecycle plus one input-boundary"), the skills category breakdown prose (`seed.md:112/525`), and `PRODUCT.md:20` spelled-out narrative. Asserting the explicit *total* on each line is reliable; parsing addends is brittle. Spec should state this scope cut explicitly (no silent truncation).
- Word↔int: `WORDS` (word→int) already exists for 1–40; reuse it for spelled-out surfaces.

**Mirror discipline:** any literal corrected/asserted in `CLAUDE.md` is corrected identically in `src/CLAUDE.template.md` (and seed↔seed.template), preserving byte-equality. Since the constitutional counts are currently all correct (only `baseline.json` drifted), the prose surfaces likely need *no edits* now — the audit check just locks them going forward.

---

## DP-4 — #14 test rewire + triage/SKILL.md template removal

- **Current**: `tests/memory-flush-phase.test.mjs` AC-006 reads `triage/SKILL.md`, finds the "For \`intake\`-entry full track" / "For \`chore\` track" prose paragraphs, and asserts `archive < memory-flush < grant-commit` ordering within the prose. This is the binding tie keeping the duplicated templates alive.
- **Rewire**: point those assertions at `.claude/workflows.jsonl`. Confirmed node shape:
  - `intake-full` nodes: `intake → scout → research → spec → spec-shippability-review → approve-spec → implementation → simplify → security → integrate → document → archive → memory-flush → cli-copy-review → grant-commit → changelog → commit`
  - `chore` nodes: `chore → memory-flush → grant-commit → changelog → commit`
  - The test parses the track line by `track_id`, maps `nodes[].id` to an index, and asserts `idx(archive) < idx(memory-flush) < idx(grant-commit)` (intake-full) and `idx(chore) < idx(memory-flush) < idx(grant-commit)` (chore). Same invariant, authoritative source.
- **Then**: delete `triage/SKILL.md:61-~95` (the "Reference: canonical track shapes" subsection). The runtime already reads `workflows.jsonl` via `seed-tasklist.mjs`; the prose was reference-only.
- **Unaffected**: AC-001 reads `harness/SKILL.md`'s fenced phase-ordering block (a different file, a genuine ordering contract) — leave it. Re-scan `memory-flush-phase.test.mjs` for any *other* assertion that greps triage prose before deleting, and re-grep the repo for stale "Reference: canonical track shapes" links.

---

## Recommendation (summary for the spec's Decisions section)

1. **DP-1 → A**: shared `derive-counts.mjs`, imported by both audit and site. Extraction of logic that already exists in `audit.mjs`.
2. **DP-2**: derive all numeric fields + word-forms (via `numToWord`); keep `byCategory` authored but audit-assert its sum; site data file becomes computed (`.cjs` async wrapper recommended for style continuity).
3. **DP-3**: canonical commands = 6; correct `baseline.json` (auto, via derivation); extend the audit's existing count engine to hard-cross-check the orientation line, Article III greeting, PRODUCT.md:40, README:44 (all mirror-aware); totals-only, no addend parsing.
4. **DP-4**: rewire AC-006 to read `workflows.jsonl` node order, then delete the triage prose templates; leave AC-001.

## Codesign flag

Two decisions are load-bearing enough that the reviewer should explicitly sign off at gate A (codesign_mode is off, so this rides the normal spec-approval rather than an in-spec codesign loop):
- **DP-1 (shared-module + ESM/CJS interop):** sets the architecture for how derived counts flow; reversible but touches the audit's read-only-anytime guarantee if done wrong (don't make the audit depend on a build artifact — Candidate B).
- **DP-3 (commands = 6, and which prose surfaces become hard-FAIL):** picks the canonical definition and the enforcement blast radius. A too-aggressive regex set could make the audit FAIL on benign prose edits; the totals-only scope cut is the mitigation.

## Open questions for the human reviewer (gate A)

- Confirm commands canonical = 6 (vs reclassifying `init-project-doctor` as a subcommand → 5). Recommendation: 6.
- Confirm the hard-FAIL surface set (orientation line + greeting + PRODUCT.md:40 + README:44) vs a narrower/wider set.
- Confirm word-form derivation (vs leaving `categoriesWord`/`sharedGlobalsWord` hand-authored). Recommendation: derive.
- ESM `_data/baseline.mjs` vs async `_data/baseline.cjs`. Recommendation: async `.cjs` for style continuity.
