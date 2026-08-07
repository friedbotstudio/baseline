# Codebase Scout Report — system-spec-delta (Cycle 2: spec declares the delta, archive verifies it)

**Mode: reconciliation, not discovery.** `memory.workspace.enabled` and `memory.architecture_map.enabled` are both `true`, and `docs/system/` holds 15 concepts / 112 elements / 112 shards. `reconcile({specDir:'docs/system', touchedPaths:[…12 paths…]})` returned:

```
mode:   "reconcile"
changed: artifact-template-guard, memory-index-helpers, memory-index-resolve,
         research-retrieve, spec-review-helpers, workspace-corpus
unreferenced: (none)
```

6 changed of 112 — a real delta, not a re-derivation. The corpus already answers "what is this system" for this slice, so the sections below add only what the corpus does not carry: line-level call sites, tests, and landmines.

`scanAnnotations` over 923 files: **5 resolved, 0 dangling.** One resolved annotation is in-slice — see Constraints.

---

## Primary touchpoints

### C2-1 — `## System delta` becomes a required spec section
- `.claude/project.json → artifacts.required_sections.spec` — today `["Goal","Design","Design calls","Acceptance criteria","Test plan"]`. Adding `System delta` here is the entire enforcement mechanism; the guard is already generic.
- `.claude/hooks/artifact_template_guard.mjs:37,44` — `rel.startsWith('docs/specs/')` → `artifactType='spec'`, then `projectGet('.artifacts.required_sections.spec')`. **No hook code changes** — the guard reads config.
- `.claude/skills/spec/template.md` — current `##` headings: Context, Goal, Non-goals, Design, Design calls, Acceptance criteria, Test plan, Observability, Rollout, Rollback, Archive plan, Open questions. The delta section slots between Design calls and Acceptance criteria on the same reasoning that put Design calls where it is.
- `.claude/skills/spec/SKILL.md:35` — Step 2.5 already documents the `@ref element:<element-id>` affordance. The delta **composes with** this, does not replace it: `@ref` satisfies the structural diagram kinds, the delta states what changes.
- `.claude/skills/spec-lint/lint.mjs:281-288` — `main()`'s `results` array is the wiring point. Current checks: `plantuml_syntax`, `diagram_presence`, `ac_traceability`, `design_calls`, plus `codesign_decisions` conditionally appended (`lint.mjs:291-295`). A `system_delta` check follows the `design_calls` pattern — a `checkSystemDelta(spec, pj, root)` returning `[status, detail]`.
- `.claude/skills/spec-lint/lint.mjs:98` — `unresolvedReferences(spec, root)` is the existing element-id resolver a `change`/`remove` row check would reuse. **It is also the slug-guard asymmetry site** — see Risks.
- `.claude/skills/spec-lint/SKILL.md:16-22` — the "three checks" table is prose that will be wrong the moment a fifth check lands. It already understates at four.

### C2-2 — Archive verifies the declared delta
- `.claude/skills/archive/SKILL.md:52` — Step 5's single `syncBack` invocation, a `node -e` one-liner. `SKILL.md` is 68 lines total; the verify-then-apply logic does not belong inline as prose.
- `.claude/skills/workspace/contribute.mjs:49` — `syncBack({specDir, memDir, rootDir, slug, touchedPaths, nonDerivable})`. Line 57 filters elements by `anchorMatches(element.anchor, path)`. This is the function being extended around, not replaced.
- `.claude/skills/workspace/delta.mjs` — **does not exist.** New Foundation module.
- Reuse targets, all present and exported:
  - `.claude/skills/workspace/coverage.mjs:15` `anchorMatches(anchor, path)` · `:35` `governedFiles({rootDir})` · `:45` `findGaps({specDir, rootDir})`
  - `.claude/skills/workspace/materialize.mjs:66` `materialize({specDir, rootDir, map})`
  - `.claude/skills/workspace/digest.mjs:29` `stampElement(specDir, id, {rootDir})` · `:45` `stampAll(specDir, ids)` — refuses without an explicit id list
  - `.claude/skills/workspace/concepts.mjs` `readConceptMap`, `conceptTitles`
  - `.claude/skills/workspace/store.mjs` `readAll`, `writeRecord`

### C2-3 — New skill `/system-reconcile` + shard writer
- `.claude/skills/system-reconcile/` — **does not exist.** New skill directory.
- `.claude/skills/workspace/shards.mjs` — **read-only today.** All four exports read: `:30` `elementIdFromSection`, `:40` `readShard`, `:57` `findUnillustrated`, `:65` `everyShardSection`. `writeShard` is the one genuinely new capability in Cycle 2.
- `.claude/skills/workspace/reconcile.mjs:170` `classify(specDir, {rootDir})` · `:186` `repairAfterMerge({specDir})` · `:201` `composableElements`
- `.claude/skills/workspace/render.mjs:25` `findOrphanShards(specDir)` — a fifth report source the plan's table does not name but `/system-reconcile` should surface alongside `repairAfterMerge`.
- `.claude/skills/memory-flush/stale-elements.mjs → listStale` — **already wired** by Cycle 1 at `.claude/skills/memory-flush/SKILL.md:106` (Step 0e). Not orphaned any more; `/system-reconcile` should not duplicate it.

### C2-4 — Witness backfill
- `docs/system/diagrams/*.puml` — 112 shards, **0 carrying `' @kind`** (`grep -l "' @kind" | wc -l` → 0).
- `.claude/skills/workspace/witness.mjs:33` `bindingFor(kind, {rootDir})` reads `project.json → memory.architecture_map.witnesses` (8 kinds configured) · `:44` `isCitable(witness)`.
- `.claude/skills/workspace/reconcile.mjs:19,141` — the **one production consumer**: `classify` calls `bindingFor(shard?.kind, {rootDir})`. With `shard.kind` undefined for all 112, every element classifies through the `witness:'none'` branch today.

### C2-5 — `research` retrieves over the corpus
- `.claude/skills/research/retrieve.mjs` (145 lines) — `:101` `retrieve({root, slug, terms})` is the only export. Its private helpers `:49` `memoryCorpusFiles`, `:66` `corpusFiles`, `:82` `scoreSource` implement term-overlap scoring over `docs/archive/**` + `decisions`/`libraries`.
- `.claude/skills/memory-index/resolve.mjs:96` `resolveLookup(kind, needle, {rootDir, specDir})` · `:99` — `by_path` **with** `specDir` routes to `:83` `resolveTouchedPath`, returning `{elements, concepts}`. This is the structural path C2-5 needs.
- `docs/system/elements/` — **14 of 112** elements carry `source_spec:`. The precise path applies to 12.5% of the corpus; term overlap must stay as the fallback, not be replaced.

### C2-6 — Constitutional amendment
- `docs/init/seed.md:371` §4.8 · `:506` §9 (`:524` is the "A spec is a diff" paragraph) · `:616` §12 (`:631` is the "Archive also syncs" paragraph). All three paragraphs exist and are the exact edit sites.
- `CLAUDE.md` Article IX — 9 numbered clauses today; clause 10 is the addition.
- `.claude/CONSTITUTION.md` — 76,904 bytes, the sanctioned relocation target for the narration that pays for clause 10.

---

## Entry points that reach this code

| Entry point | Path | Reaches |
|---|---|---|
| Write to `docs/specs/*.md` | `.claude/hooks/artifact_template_guard.mjs:37` (PreToolUse) | C2-1 required-section check |
| Write to `docs/specs/*.md` | `.claude/hooks/spec_diagram_presence_guard.mjs` (PreToolUse) | `@ref` element resolution, `assertSafeSlug` |
| `/spec-lint <slug>` | `.claude/skills/spec-lint/lint.mjs:258` `main(argv)` | C2-1 lint check |
| `/archive` Step 5 | `.claude/skills/archive/SKILL.md:52` | C2-2 verify-then-apply |
| `/archive` Step 5.5 | *(does not exist)* | C2-3 report-only invocation |
| `/system-reconcile` | *(does not exist)* | C2-3, C2-4 |
| `/research` Step 0 | `.claude/skills/research/retrieve.mjs:101` | C2-5 |
| SessionStart hook | `.claude/hooks/lib/memory_session_start.mjs` `buildIndex` | reads the concept map C2-4 makes citable |
| PreToolUse write leg | `.claude/hooks/process_lifecycle_guard.mjs` `surfaceGovernedMemoryFor` | corpus-location block (Cycle 1) |
| `node .claude/skills/audit-baseline/audit.mjs` | `checks/src-templates-a.mjs:48-54`, `checks/constitution.mjs:24` | C2-6 mirror + citation checks |

---

## Existing tests

| Test | Covers | State |
|---|---|---|
| `tests/workspace-coverage.test.mjs` | `findGaps` returns `[]` over the live repo; zero dangling | passing — **live-corpus assertion, must stay green** |
| `tests/workspace-readme-gate.test.mjs` | README names no field no element carries | passing — the delta section must add **no element field** |
| `tests/system-spec-sync.test.mjs` | `CANONICAL` stays 8; `readAll().views` stays empty | passing — must stay green |
| `tests/workspace-shards.test.mjs` | `readShard`, `findUnillustrated`, `everyShardSection` | passing — the `writeShard` home |
| `tests/workspace-reconcile.test.mjs` | `reconcile`, `classify`, `repairAfterMerge` | passing |
| `tests/workspace-digest.test.mjs` | `stampElement` incl. the `..` CWE-22 guard | passing |
| `tests/workspace-contribute.test.mjs` | `syncBack` apply/propose split | passing — C2-2 extends this surface |
| `tests/system-spec-sync-back.test.mjs` | archive fold-back behaviour | passing |
| `tests/system-spec-witness.test.mjs` | `bindingFor` per kind, `isCitable` | passing — C2-4 makes it non-vacuous |
| `tests/system-spec-as-diff.test.mjs` | seed §9 "spec is a diff" doctrine | passing — C2-6 amends the text it asserts |
| `tests/research-retrieve.test.mjs` | term-overlap retrieval | passing — C2-5 extends |
| `tests/spec-lint-design-calls.test.mjs` | the `design_calls` check | passing — **the pattern to copy for `system_delta`** |
| `tests/corpus-recall-reachability.test.mjs` | Cycle 1's five defect fixes | passing |
| `tests/gitignore-governance-cascade.test.mjs:45` | `CLAUDE.md ≤ 38,800 chars` | passing at 38,716 — **84 chars slack** |
| `tests/code-browser-primary-navigation.test.mjs:39` | `CLAUDE.md ≤ 39,000 bytes` | passing at 38,943 — **57 bytes slack** |

No skipped or flaky tests found in the slice.

---

## Constraints and co-changes

- **`project.json` is the only config change for C2-1.** Adding `System delta` to `artifacts.required_sections.spec` retroactively binds every future spec write. It does **not** bind archived specs (the guard fires at the write boundary only), so no backfill of `docs/archive/**` is implied.
- **`src/project.template.json` must NOT gain `memory.architecture_map`.** It ships absent so every consumer reads `false`. Every new Cycle 2 path is flag-gated and fail-open (absent flag / absent corpus / read error → inert).
- **Mirror discipline is not uniform — verify before editing:**
  - `CLAUDE.md` ↔ `src/CLAUDE.template.md`: **byte-equal**, asserted by at least four tests (`chore-verify-conditional.test.mjs:82`, `code-browser-primary-navigation.test.mjs:116`, `checker-graduation-amendment.test.mjs:33`, `article-ii-advisory-subagents.test.mjs:89`).
  - `docs/init/seed.md` ↔ `src/seed.template.md`: **pre-§16 body mirrors** (`article-ii-advisory-subagents.test.mjs:99`), §17 byte-equal (`article-iv-mirror.test.mjs:33`), and §16 must stay **pristine** — `audit-baseline/checks/src-templates-a.mjs:53` FAILs if the template's §16 contains a `Generated:` stamp. The live seed's §16 is populated by design; `cmp` reports 100 diff lines and that is correct.
- **Shipped helper constraints** (`spec-shippability-review`): new helpers must be `.mjs`/`.js`/`.sh` (no Python), must be listed in `obj/template/.claude/manifest.json`, and shipped `SKILL.md` prose must not reference `src/`, `tests/`, `scripts/`, or `obj/` paths as runtime invocations.
- **`/system-reconcile` needs `owner: baseline` frontmatter** (Art. XII) and lands in `owners.skills` + per-file sha256 in the manifest. The skill count moves 57 → 58 in `CLAUDE.md`, `seed.md`, `README.md`, and the docs site — `audit-baseline` reconciles all four.
- **Resolved annotation in-slice:** `.claude/skills/workspace/placement.mjs:48` → `decision/load-bearing-marker-requires-engineer-confirmation-2026-08-04`: *"Claude may propose `load_bearing: true` with cited rationale; the engineer confirms before it sticks."* If `writeShard` or the delta writer touches placement, that confirmation requirement holds.

---

## Patterns in use here

The `workspace/` modules are flat Foundation helpers: one responsibility per file, named exports only, no classes, no shared mutable state, `{ specDir, rootDir }` options-object convention throughout, and every path-taking function guards `..` before any filesystem read (`digest.mjs`, `reconcile.mjs`). Skills invoke them exclusively through `node -e "import('./…').then(…)"` one-liners in `SKILL.md`, never through a CLI shim. Flag gating is a first statement, not a wrapper: `flags.mjs → workspaceEnabled/annotationsEnabled` is called at the top of a step and returns early. Every corpus reader is fail-open — an absent flag, absent corpus, or read error yields an empty result, never a throw.

---

## Risks / landmines

1. **`findGaps` is not orphaned — it is unreachable, which is worse.** The intake says "no production caller". Precisely: `coverage.mjs:45` is imported at `sync.mjs:13` and called at `sync.mjs:84`, inside `runSync` — the `spec-sync` **bootstrap** path, which is destructive on a populated corpus and by the intake's own non-goals never runs here. So it has a caller that can never fire. Anyone grepping for callers will find one and conclude the gap is closed.

2. **`writeShard` is a name collision.** `tests/helpers/memory-fixtures.mjs` already exports `writeShard(memDir, category, …)` for **memory** shards. The new one writes **PlantUML diagram** shards. Two different subsystems, same verb, same noun. Name it `writeDiagramShard`, or expect the confusion to land in a test file that imports both.

3. **`syncBack`'s `applied[]` overstates by ~2.7×** — backlog `syncback-applied-overstates-what-it-stamped-8e21`, measured: 8 reported, 3 digested. Glob-anchored elements are never digested but still counted. C2-2 builds its receipt directly on top of this. Partition the return value (`stamped` / `skippedGlob` / explicit empty-input signal) rather than adding a count on top of a wrong one.

4. **zsh does not word-split, and `syncBack` returns `{applied:[],proposed:[]}` for both "you passed nothing" and "nothing matched"** — landmine `zsh-does-not-word-split-so-node-e-argv-arrives-as-one-argument`. Archive Step 5's first real execution silently did nothing and reported success. `SKILL.md:55` documents the fix (quoted JSON array). Any new `node -e` invocation in C2-2/C2-3 inherits the same trap.

5. **The swarm heuristic counts 0 components for any `@ref` spec** — backlog `swarm-heuristic-counts-zero-components-for-any-ref-spec-4d21`. `harness/SKILL.md` greps `^\s*Component\(`; seed §9 tells specs to satisfy the C4 kinds with `@ref` **instead of** drawing them. Every spec-as-diff spec routes solo, silently. This epic's children are single slices and would route solo anyway — but C2-1 makes `@ref` specs the norm, so the defect gets more reachable, not less. Out of scope; record the interaction.

6. **`spec-lint` skips the slug guard the diagram guard applies** — backlog `spec-lint-omits-the-slug-guard-the-diagram-guard-applies-b93f`. `spec_diagram_presence_guard` calls `assertSafeSlug(id)` before building `docs/system/elements/<id>.md`; `lint.mjs:98 unresolvedReferences` goes straight to `existsSync`. C2-1 adds a **second** element-id resolver to `lint.mjs` — write it through the guard's validation from the start, or the divergence doubles.

7. **`process_lifecycle_guard` interpolates an unsanitised path into an advisory block** — backlog `advisory-block-interpolates-an-unsanitised-file-path-8c7e` (CWE-117). Two sites share the pattern. Cycle 1 made the block actually fire. Any new advisory renderer in C2-3 must not copy the pattern.

8. **The `CLAUDE.md` budget trap has fired twice** — landmine `claude-md-real-headroom-is-test-enforced-38800-not-the-40000-cap`, the second time with the entry already on disk. 84 chars / 57 bytes of slack, and the units disagree (an em dash is 1 char, 3 bytes). The sanctioned payment is relocating existing Article IX narration to `.claude/CONSTITUTION.md`. Do not raise a ceiling.

9. **`stampAll` refuses without an explicit id list** (`digest.mjs:45`). That refusal is the mechanism. C2-3's repair path must collect ids and pass them, never reach for a bulk convenience.

10. **`spec-lint/SKILL.md` already understates its own check count** — it says "three checks" while `lint.mjs` wires four plus a conditional fifth. C2-1 makes it six. The prose drift is the same class Cycle 1's C1-5 fixed; fix it in the same edit.
