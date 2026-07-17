# Pattern Research — memory-system redesign (graph-indexed, one-fact-per-file, decision-point surfacing)

No third-party library is involved — the store is markdown + zero-dep `.mjs` (only runtime dep is `@clack/prompts`, unrelated). `context7` not invoked (no external API to verify). These are end-to-end **architectural** candidates; the human picks at `/spec`. Each bundles the load-bearing sub-decisions the intake + scout surfaced.

## Prior art (retrieved)

- **`docs/archive/2026-05-13/memory-lifecycle-closure/research.md`** — established the closure-field schema (`resolved-at:` on pending-questions, `superseded-at:` on the other five; hybrid structured + prose detection; inline stale listing). **Delta:** that work assumed the seven-file shape; this redesign changes the container but MUST carry the closure semantics forward unchanged (AC-5 provenance + closure fields survive migration). Reused, not re-derived.
- **Claude Code's own session-memory model** (the `MEMORY.md`-indexed, one-fact-per-file, `[[wikilink]]` store described in the CC system prompt) — the working reference design for exactly the target shape: one fact per file + a one-line-per-fact index loaded upfront. **Delta:** it is the *pattern proof*; the project store adds phase-scoped injection (AC-3), provenance/verbatim rigor (Art IX.6), and the 191-entry migration that the CC store never needed.
- **`.claude/hooks/process_lifecycle_guard.mjs`** (scout) — the working *decision-point injection* precedent (trigger → scoped key → read → surface verbatim+interpretation inline, citing Art IX.7). Every candidate below generalizes it; the delta is the trigger key (Bash pattern → workflow phase).

### Sub-decisions each candidate resolves

| # | Sub-decision | Options |
|---|---|---|
| D1 | Storage layout | seven files stay / **category directories** (`<category>/<key>.md`) / **flat typed vault** (`facts/*.md`, category becomes `type:`) |
| D2 | Index/graph shape | generated `INDEX.md` (one line/fact, human+machine) / `graph.json` adjacency / both |
| D3 | Injection mechanism | generalize `process_lifecycle_guard` to a phase-keyed query / new per-phase advisory hook / phase skills self-query the index by `scope:` tag |
| D4 | Committed vs gitignored | per-fact files committed / gitignored bodies + committed index |
| D5 | Migration cutover | big-bang / dual-read shim during transition / incremental per-category |
| D6 | Audit rework | teach `audit.mjs` the new shape / move per-fact files under a subdir the audit walks differently |

## Candidate A: Category-directory shards (evolutionary) — RECOMMENDED

- **Summary**: The seven categories survive as **directories**, not files. Each entry explodes to its own file `.claude/memory/<category>/<key>.md` (e.g. `landmines/lsof-port-kill-takes-firefox-with-it.md`), keeping the same per-entry frontmatter (`source:`/`verified-at:`/`last-touched:`/verbatim blockquote). A generated `INDEX.md` carries one line per fact (`[[category/key]] — one-line hook · scope: <phase>`) plus the graph edges parsed from `[[wikilinks]]`. Injection generalizes `process_lifecycle_guard`: a phase skill queries the index for `scope: <its-phase>` entries at its decision point and surfaces verbatim before the relevant write.
- **D1** category dirs · **D2** generated `INDEX.md` (graph edges from wikilinks) · **D3** generalized guard, phase-keyed · **D4** per-fact committed, `INDEX.md` generated (gitignored or committed-derived) · **D5** incremental per-category · **D6** audit walks category dirs.
- **Fits**: Directly on the scout's strongest signal — the seven category *names* still exist (smallest Article IX reword: "seven canonical files" → "seven canonical categories"), so `EXPECTED_MEMORY_FILES` becomes `EXPECTED_MEMORY_CATEGORIES` with a bounded, mechanical audit change. Reuses the existing per-entry frontmatter verbatim (AC-5 migration is a mechanical explode, not a rewrite). Generalizing `process_lifecycle_guard` reuses a shipped, tested idiom (scout).
- **Tests it enables**: Migration audit (191 files out, 0 provenance lost) as a fixture. Index-generation snapshot (facts → INDEX lines + edges). The `-7f3a` regression: seed the outcome-AC landmine with `scope: spec`, assert it surfaces at spec-authoring (AC-3). Per-fact size assertion (no file exceeds a small bound — AC-4). Audit-shape test for category dirs.
- **Tradeoffs**:
  - Strength: delivers all three wins (no huge file; cheap `INDEX.md` upfront; active constraint via scope tags) at the **lowest governance + audit blast radius** — the category taxonomy that Article IX, the README, and the seven skill-owners all reference stays intact.
  - Strength: migration is per-entry mechanical and incremental (one category at a time), so dual-read is only ever within one category; the hooks can read old-file-or-new-dir per category during cutover.
  - Weakness: keeps a *taxonomy* (seven categories) that the pure-Obsidian vision might not want — a fact that is both a landmine and a decision must pick a home dir (mitigated by `[[wikilinks]]` + `type:` tags allowing cross-category edges).
  - Weakness: `INDEX.md` is a generated artifact — needs a generator + a guard that it stays in sync with the fact files (a drift surface).

## Candidate B: Flat typed vault + graph index (Obsidian-faithful) — fullest vision, highest cost

- **Summary**: One flat `.claude/memory/facts/` directory of `*.md` files; the seven categories collapse into a `type:` frontmatter value. Each file carries `type:`/`scope:`/`links:[[...]]` frontmatter. A build step emits both a `graph.json` adjacency structure and a human-readable `INDEX.md`; the store is openable directly as an Obsidian vault (real wikilink resolution, graph view). Injection: phase skills query `graph.json` by `scope:` at their decision point.
- **D1** flat typed vault · **D2** both (`graph.json` + `INDEX.md`) · **D3** self-query by scope tag · **D4** committed facts + committed index · **D5** big-bang · **D6** audit walks `facts/` with a per-fact shape check.
- **Fits**: The truest realization of the user's "system like Obsidian + network-graph" framing and the "both consumers, machine-weighted with human vault navigation first-class" brainstorm answer. Arbitrary cross-type links are native (no category home to pick).
- **Tests it enables**: `graph.json` generation + traversal tests; vault-compatibility (wikilink resolves to a file, AC-8); scope-query tests; the full 191→flat migration audit.
- **Tradeoffs**:
  - Strength: no taxonomy compromise; a fact links freely; graph view is a genuine human affordance.
  - Strength: cleanest conceptual model — one shape, `type:` is just a tag.
  - Weakness: **highest governance + audit rewrite.** Article IX, the README file-table, the seven skill-owner mappings, `EXPECTED_MEMORY_FILES`, `derive-counts.mjs`, and the `src/memory/*.template.md` mirrors all lose the seven-file structure and must be re-authored around `type:`. Bigger `seed.md` amendment.
  - Weakness: big-bang migration of 191 entries at once is the riskiest cutover; a mid-migration failure leaves the store in a mixed state the hooks may not read.
  - Weakness: a second generated artifact (`graph.json`) to keep in sync, and it is machine-only JSON in a markdown-first, zero-dep store (mitigable with a tiny pure-`.mjs` generator).

## Candidate C: Derived graph index over the existing store (lowest risk, partial win)

- **Summary**: Leave the write path as-is (entries still land in the seven files) and add a **read layer**: a generator derives `INDEX.md` + graph edges from the existing files, and injection reads that derived index at decision points. The one-fact-per-file explosion is deferred.
- **D1** seven files stay · **D2** generated index over existing files · **D3** generalized guard · **D4** unchanged · **D5** n/a (no cutover) · **D6** none.
- **Fits**: Minimal disruption; ships the AC-2 (cheap index) and AC-3 (injection) wins fast without touching Article IX's file enumeration or the audit.
- **Tradeoffs**:
  - Strength: fastest, reversible, no governance amendment, no migration risk.
  - **Weakness (disqualifying against the goal): it does NOT solve AC-1 (one-fact-per-file) or AC-4 (no cap-forced prune).** `landmines.md` stays a 502-line file under the 500 cap; the user's core complaint ("no single file holding ~10000 lines") is untouched. This is a genuine option only if the user later decides the cap/scale problem is acceptable and only injection+index matter — which the intake explicitly rejects.

## Recommendation

**Candidate A (category-directory shards).** It delivers every intake AC — one-fact-per-file (1), index-only upfront (2), decision-point surfacing via generalized `process_lifecycle_guard` (3), no cap-forced prune (4), mechanical lossless migration (5), scope coverage (6), governance coherence (7), vault-navigable wikilinks (8) — at the **lowest governance and audit blast radius**, because the seven-category taxonomy that Article IX, the README, the audit, and the seven skill-owners all depend on survives as directories. Migration is incremental and per-category, which is the safest cutover.

**What flips the decision to B:** if human vault navigation (a real Obsidian graph view, arbitrary cross-type linking) is judged *primary* rather than the first-class-secondary the brainstorm settled on — then the taxonomy compromise in A is the wrong trade and the fuller B rewrite is worth its cost. **C is disqualified** by the goal (leaves the cap/scale problem intact) and is documented only to record why the low-risk path doesn't satisfy the intake.

**Slicing note (for the epic re-triage decision):** A decomposes cleanly into (i) storage-model + audit rework, (ii) index/graph generator, (iii) decision-point injection (generalized guard), (iv) 191-entry migration, (v) governance amendment — ≥3 separately-committable slices. If `/spec` confirms this decomposition, re-triage `intake-full` → `epic`.

## Open questions

- **Scope-tag vocabulary** — what `scope:` values exist (the phase names? finer?), and whether an entry may carry multiple scopes. Drives the injection query. (spec)
- **INDEX.md: committed or generated-on-load?** A committed index is diff-reviewable but a drift surface; a load-time-generated index never drifts but costs a scan each session start. (spec)
- **Graph edges: wikilinks-only or explicit `links:` frontmatter?** Reuse the existing `[[wikilink]]` convention vs a typed edge list. (spec)
- **Migration cutover** — incremental-per-category (A's default) vs big-bang; and how the three hooks dual-read old-file-or-new-dir during transition. (spec → rollout)
- **Audit contract** — `EXPECTED_MEMORY_CATEGORIES` walking dirs vs a per-fact shape check; how `size-cap`/decay re-express when a file is one fact. (spec)
- **Continuity classes** — do `_resume`/`_thread`/`_pending` adopt the per-fact model too, or stay as-is (they are already single-purpose trails, not multi-entry stores)? Brainstorm put them in scope; spec decides whether "in scope" means restructured or merely re-documented. (spec)
