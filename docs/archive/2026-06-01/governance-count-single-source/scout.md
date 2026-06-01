# Codebase Scout Report — governance-count-single-source (WF-5)

Scope: every surface that states a harness governance count as a literal, the ground-truth way to count each artifact on disk, and the build/audit/triage integration points the spec will touch. Source-read only.

## Ground truth on disk (as of HEAD d336e01)

| Artifact | Count | How derived | Notes |
|---|---:|---|---|
| Skills (baseline) | **40** | `SKILL.md` with `owner: baseline` | 45 `SKILL.md` total on disk; 5 are user/vendored (no `owner: baseline`). `manifest.owners.skills` map = 40 baseline, agrees exactly. |
| Hooks | **22** | `.claude/hooks/*.mjs` top-level | `.claude/hooks/lib/*.mjs` = 8 helpers, excluded. Audit already strips `addHooks` (project additions). |
| Commands | **6** | `.claude/commands/*.md` | approve-spec, approve-swarm, grant-commit, grant-push, init-project, **init-project-doctor**. The 6th (doctor) is a separate file. |
| Subagents | **1** | `.claude/agents/*.md` | swarm-worker.md |
| Selectable tracks | **5** | `workflows.jsonl` `selectable:true` | 7 track lines total (5 selectable + 2 sub-tracks: swarm-implementation, tdd-worker-chain). |
| Memory canonical files | **7** | `.claude/memory/*.md` minus `_pending/_resume/_thread/README` | |
| MCP servers | **3** | `.mcp.json` mcpServers keys | context7, plantuml, playwright |

## ⚠️ Live drift already present (the bug this WF kills)

- **`site-src/_data/baseline.json:commands: 5`** — disk has **6**. The site renders "5 consent commands" (via `{{ baseline.commands }}` in `install.njk:92`) while `CLAUDE.md` orientation says "6 commands". Uncaught because the audit's count-check only reads `seed.md`, never `baseline.json`.
- **Definition split on commands:** `baseline.json` and `seed.md` (`four consent gates + one bootstrap + one doctor` → audit computes 6) treat "doctor" inconsistently. `seed.md`→6, `baseline.json`→5. **Spec must pick the canonical definition** (recommended: count `.claude/commands/*.md` = 6, since the doctor ships as its own command file). This is the one count where surfaces genuinely disagree today.

## (A) Count-literal surfaces — inventory for per-surface treatment

Treatment legend: **D** = should be build-derived (generated/read from canonical source); **X** = static prose, cross-check by audit (cannot be templated); **S** = structured data (make derived).

| File:line | Literal | Refers to | Surface kind | Suggested treatment |
|---|---|---|---|---|
| `site-src/_data/baseline.json` | `hooks.total:22, skills.total:40, subagents.total:1, commands:5, tracks.canonical:5, tracks.subTracks:2, phases:11, gates:4` + word forms (`categoriesWord:twelve`, `sharedGlobalsWord:seven`, `mcpServersWord:three`, `subagents.totalWord:one`) | all | structured data, hand-authored | **S→D**: make derived at build (it feeds the whole site via `{{ baseline.* }}`) |
| `CLAUDE.md:44` / `src/CLAUDE.template.md:44` | "22 hooks, 1 subagent, 40 skills" | hooks/subagent/skills | Article III greeting — **binding constitutional prose** | **X** (mirror pair) |
| `CLAUDE.md:328` / `src/CLAUDE.template.md:328` | ".claude/hooks/ (22 hooks), .claude/agents/ (1 subagent …), .claude/skills/ (40 skills), .claude/commands/ (6 commands), .claude/memory/ (7 canonical files), .mcp.json (3 MCP servers)" | hooks/subagent/skills/commands/memory/mcp | Appendix B quick-orientation prose | **X** (mirror pair) — richest single line, 6 counts |
| `CLAUDE.md:7,180,92,326` / mirror | "22 hooks" (×3), "all 40 skills" | hooks/skills | constitutional prose | **X** (mirror pair) |
| `PRODUCT.md:20` | "twenty-two … hooks, forty skills, one subagent … eleven-phase … three … gates" | hooks/skills/subagent/phases/gates | product narrative (spelled-out) | **X** |
| `PRODUCT.md:40` | "`22 hooks`, `40 skills`, `1 subagent`, `11 phases`, `4 gates`" | hooks/skills/subagent/phases/gates | meta-strip example (explicitly "verifiable from the codebase") | **X** |
| `README.md:44` | "22 hooks, 40 skills … 1 subagent, 5 canonical workflow tracks … 3 … consent gates" | hooks/skills/subagent/tracks/gates | README prose | **X** |
| `README.md:175` | "22 hooks" | hooks | README prose | **X** |
| `docs/init/seed.md:14` / `src/seed.template.md:14` | "seventeen … guards plus four lifecycle … plus one input-boundary (twenty-two hook scripts total), forty skills, one subagent, and four consent gates" | hooks(17+4+1=22)/skills/subagent/gates | genesis prose (spelled-out) — **mirror pair** | **X** — this is what audit `findCount` already parses |
| `docs/init/seed.md:110-113,122,525` / mirror | "1 subagent", "40 skills: artifact (4)+…", "7 canonical files", "<7 canonical>" + the §4.3 breakdown | subagent/skills/memory + category breakdown | genesis tree + Step 5 prose | **X** — category breakdown also hardcoded here |
| `site-src/workflows.njk:8,10,36` | "Five selectable tracks" (×3) | tracks | site narrative (spelled-out, NOT using `baseline.*`) | **D** (should read `baseline.tracks.canonical` word-form) |
| `site-src/workflows.njk:46` | "Two sub-tracks" | sub-tracks | site narrative | **D** |
| `site-src/index.njk:194` | "eleven phases with three consent gates" | phases/gates | site `<title>` | **D** (or X) |
| `site-src/404.njk:48,63`, `memory.njk:8,10,29`, `skills/*.njk`, `base.njk:63`, `install.njk:92` | `{{ baseline.hooks.total }}`, `{{ baseline.skills.total }}`, `{{ baseline.commands }}`, `{{ baseline.subagents.* }}`, `{{ baseline.skills.categoriesWord/sharedGlobalsWord }}` | all | **already templated** off `baseline.json` | **D done** — these auto-fix once `baseline.json` is derived |
| `site-src/memory.njk`, `404.njk` | "Seven canonical files" (spelled-out, hand-typed) | memory | site narrative not using `baseline.*` | **D** (add `baseline.memory.canonicalWord`) |

Two count families are stated as **category breakdowns**, not single numbers: `baseline.json:skills.byCategory` (4+11+5+4+3+1+1+1+7+1+1+1=40) and `seed.md:112/525` prose. These must stay internally consistent with the skills total; the spec decides whether to derive the breakdown or only the totals.

## (C) Build + audit integration points

- **`.claude/skills/audit-baseline/audit.mjs`** already contains the engine for #13, wired only to seed.md:
  - Disk derivation: `diskBaselineHooks` (`:151`), `diskBaselineSkills` (owner-filtered, `:153`), `diskBaselineAgents`, `diskCommands` (`:149`). `loadManifest()`/`canonicalSkills` (`:215`) read `manifest.owners.skills`.
  - Claim extraction from **seed.md only**: `findCount(...)` (`:162`) + `WORDS` word→int map (`:107`) + the `cmdsClaimed` special-case (`:180-182`, the `four consent gates + one bootstrap + one doctor`→6 regex).
  - Verdict: `checkCount(label, claimed, actual)` (`:184`) — PASS if equal, FAIL `seed claims X, disk has Y`, WARN if unextractable. Called for hooks/agents/skills/commands (`:190-193`).
  - `add(label, status, detail)` is the report primitive; any FAIL exits 1.
  - **Gap to close (#13):** extend to additional surfaces (baseline.json, the CLAUDE.md/mirror orientation line, PRODUCT.md, README) and additional kinds (tracks, mcp, memory-files, subagents already partly done). The disk-derivation half already exists and is reusable.
- **`scripts/build-template.sh`** is an allowlist bulk-copy + `src/*.template.*` overlay + `manifest.json` stamp (Stage 0a seed memory, Stage 0b sync `src/cli` mirrors, Stage 2 overlay). It does **not** build the site. A derived-counts artifact could be emitted here, but the site is built separately.
- **Site build:** `package.json` → `build:site => eleventy`, config `eleventy.config.cjs`. Eleventy auto-loads `site-src/_data/*` as global data keyed by filename → `baseline.json` becomes `{{ baseline.* }}`. `_data/site.cjs` already uses `require`/`fs`, proving **`_data/*.cjs` can read disk at build time** — so a computed `_data/baseline.cjs` (replacing the static `.json`) reading `.claude/hooks`, `.claude/commands`, `.claude/skills/*/SKILL.md`, `.mcp.json`, `workflows.jsonl` from repo root is viable. The site is the baseline's own site (built in this repo where `.claude/` exists), not the consumer's.

## (D) The triage/SKILL.md ↔ workflows.jsonl ↔ test triangle (#14)

- **`triage/SKILL.md:61-~95`** — the "**Reference: canonical track shapes (mirrored in workflows.jsonl)**" subsection carries per-track template bodies for chore (`:63`), tdd-quickfix (`:70`), spec-entry (`:73`), intake-full (`:75`), freeform (`:77`). This is the duplicate of the authoritative `.claude/workflows.jsonl` track DAGs.
- **`tests/memory-flush-phase.test.mjs`** — **AC-006** (`:122-141+`) is the binding tie: `test_when_triage_seeds_intake_entry_full_track_…` reads `triage/SKILL.md`, finds the "For \`intake\`-entry full track" template paragraph, and asserts `archive < memory-flush < grant-commit` ordering **inside that prose block**; a sibling test does the same for the chore template (`:138`). These tests are why removing the templates breaks the suite (the earlier WF-3 caveat noted this). **AC-001** (`:105-117`) reads `harness/SKILL.md`'s fenced ordering block — separate, stays.
  - **Rewire (#14):** point AC-006's ordering assertions at `.claude/workflows.jsonl` track node sequences instead of the SKILL.md prose, THEN delete `triage/SKILL.md:61-95`.
- **`.claude/workflows.jsonl`** — 7 track lines; each declares its node DAG with phase order. The authoritative source the rewired test reads.

## Constraints and co-changes (lockstep)

- Mirror pairs must stay byte-equal: `CLAUDE.md` ↔ `src/CLAUDE.template.md`, `docs/init/seed.md` ↔ `src/seed.template.md`. Any X-treatment audit-cross-check applies to both members; any edit to one is mirrored. (`tests/article-iv-mirror`, `build-template-mirror-sync` enforce.)
- `CLAUDE.md` 40k char cap holds (binds the mirror too).
- Article XI manifest invariants: `manifest.owners.skills` is the skill-count source; do not perturb it.
- `tests/vendored-mirror-bytes.test.mjs` enforces `src/cli` ↔ `.claude/skills/{triage,harness}` byte-equality (relevant if any helper moves).

## Patterns in use here

- The audit registers checks as `add(label, status, detail)` calls and exits 1 on any FAIL; word-numbers go through the `WORDS`/`toInt` map. New checks follow the same shape — derive from disk, extract claim, `checkCount`.
- Eleventy global data is filename-keyed; converting `baseline.json`→`baseline.cjs` keeps every `{{ baseline.* }}` reference working unchanged.

## Risks / landmines

- **Spelled-out forms** (`forty`, `twenty-two`, "Five selectable tracks") need word↔int handling for any audit cross-check — the `WORDS` map already covers 1-40; tracks/gates are small so fine.
- **Counts embedded in compound sentences** (e.g. `seed.md:14` "seventeen guards plus four lifecycle plus one input-boundary (twenty-two total)") — the audit can only safely assert the explicit total ("twenty-two hook scripts total"), not the addends, unless the spec wants to parse the decomposition. Suggested: assert totals only; treat addend breakdowns as prose.
- **`PRODUCT.md:40`** literally advertises the counts as "verifiable from the codebase" — strong argument for an audit cross-check on this exact line.
- The skills **category breakdown** (`byCategory`, seed.md §4.3) is a second, finer-grained count surface that can drift independently of the total; spec decides scope (totals-only is the lower-risk cut).
