# Pattern Research — system-spec-delta (Cycle 2: spec declares the delta, archive verifies it)

## Prior art (retrieved)

`retrieve.mjs` scanned 199 sources and returned **182 hits** — a 91% hit rate, which is itself the C2-5 evidence. The ranked head is the correct lineage; everything below score 6 is term-overlap noise (`upgrade-flow-rework/spec.md`, `semantic-release-automation/spec.md`, and `site-positioning-org-ship/spec.md` all score ≥ 6 on words like "element", "section", "required").

| Source | Score | What it already answers |
|---|---:|---|
| `docs/archive/2026-08-06/corpus-recall-reachability/spec.md` | 14 | Cycle 1 — the recall leg. Reachability is done; do not re-derive it. |
| `docs/archive/2026-08-06/workspace-corpus-backfill/spec.md` | 13 | Digest/staleness mechanics; D3/D4 (detect mechanically, re-stamp by hand). |
| `docs/archive/2026-08-05/architecture-map/spec.md` | 12 | D3 (no stored views), D8 (a diagram routes, code witnesses). |
| `docs/archive/2026-08-06/central-system-spec/spec.md` | 12 | The `docs/system/` relocation + the one-writer rule. Deferred nothing (`spec.md:667`). |
| `docs/archive/2026-08-04/living-system-model-ef/spec.md` | 8 | D1/D2 — id-based identity, typed `add`/`update`/`remove` ops, conflicts reported never resolved. |

**Decisions already made upstream — treat as settled, not as candidates:**

- `corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06` — `/archive` Step 5 on the primary tree is the corpus's sole writer within a workflow. Its re-verification clause: *"If a future cycle adds `docs/system/**` to any swarm worker `write_set`, or wires a corpus write into a phase that runs inside a wave, this decision is void."* C2-3's report-only rule at archive Step 5.5 is what keeps it standing.
- `staleness-detection-is-mechanical-but-re-stamping-is-curation-4b18` — *"The absence is the design. `State — element honesty` has no `Stale --> Fresh` transition that does not pass through a curator."* Constrains what the one writer may do.
- `conflicts-are-reported-never-auto-resolved-2026-08-04` — element identity is a declared `id:`; a contribution is typed `add`/`update`/`remove` against ids; rejection is **atomic** (a contribution carrying any conflict writes nothing). **The delta table's verb column is this vocabulary already.** C2-1 is not inventing an op model; it is surfacing the existing one into the spec.
- `unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06` — a `witness: none` shard routes and is never evidence; a resolvable `anchor-digest` or named passing `test` may be cited. C2-4 is what moves 112 shards from the first tier to the second.
- `authored-records-are-not-stored-views-2026-08-06` — `readAll().views` stays empty; no composed rendering on disk. `writeShard` writes an **authored record's illustration**, not a view — but the boundary is thin enough to name in the spec.
- `structurizr-semantics-adopted-dependency-rejected-2026-08-04` — zero runtime deps, Node builtins only, no JVM. Verified sources recorded 2026-08-04 with URLs. Structurizr's `workspace extends` is the precedent the delta table follows.

**Genuine delta not covered upstream:** where verify-then-apply lives, how a declared delta is represented and linted, where the `' @kind` annotation sits in a shard, and how structural retrieval composes with term overlap. Those are derived below.

---

## Third-party API verification

This change adds **no dependency**. `package.json` carries one runtime dep (`@clack/prompts@1.4.0`, CLI-only) and eight devDeps; none is touched. Every helper is zero-dep `.mjs` on Node builtins, per the standing non-goal in `structurizr-semantics-adopted-dependency-rejected-2026-08-04`.

One third-party **format** is written against — PlantUML source, for C2-4 and `writeShard`. Verified against current docs, not recall:

| Format element | Verified behaviour | Source |
|---|---|---|
| Line comment | A single apostrophe **at the beginning of a line**. The docs' own example flags `' this is not a comment and this line is ignored` for an apostrophe that follows content on the same line. | context7 `/websites/plantuml` → https://plantuml.com/en/commons |
| Block comment | `/'` … `'/`, C-style with apostrophes; may span lines or sit inline. | same |
| `!startsub NAME` / `!endsub` | Preprocessing directive defining a named section; consumed elsewhere by `!includesub file.puml!NAME`. Content **inside** the block is what an include pulls in. | context7 `/websites/plantuml` → https://plantuml.com/en/preprocessing |

**Consequence, and it is load-bearing:** `shards.mjs:19` already reads `KIND = /^'\s*@kind\s+([A-Za-z0-9_-]+)\s*$/m` — line-anchored, exactly matching PlantUML's rule. The reader is correct and needs no change. **C2-4 is a pure data backfill against an already-correct parser.** The only open question is placement relative to `!startsub` (below).

`plantuml -checkonly` is advisory-by-default in this repo (no JVM), so the annotation is parsed by `shards.mjs`, never by PlantUML. A malformed annotation degrades to `kind: null` — the current state of all 112 — rather than failing a render.

---

## Candidate A: New `workspace/delta.mjs` Foundation module, archive orchestrates

- **Summary**: A new sibling in `.claude/skills/workspace/` exporting `parseDelta(specText)` and `verifyDelta({rows, touchedPaths, specDir, rootDir})`, returning a partitioned result (`confirmed` / `drift` / `unclaimed`). `/archive` Step 5 parses, verifies, then applies only `confirmed` rows via the existing `materialize` / `stampElement` / `writeShard` calls. This is the plan's stated shape.
- **API references (current)**: none external. Internal reuse — `coverage.mjs:15 anchorMatches`, `coverage.mjs:35 governedFiles`, `materialize.mjs:66 materialize`, `digest.mjs:29 stampElement`, `concepts.mjs readConceptMap`.
- **Fits**: **Yes.** Scout §Patterns: "flat Foundation helpers, one responsibility per file, named exports only, `{specDir, rootDir}` options-object convention". `delta.mjs` is that shape exactly. It also keeps `contribute.syncBack` — which the backlog says already overstates its receipt by ~2.7× — out of the new logic's dependency path.
- **Tests it enables**: pure-function unit tests on `parseDelta` (table → rows) and `verifyDelta` (rows + a synthetic touched-path list → partition), with no filesystem beyond a temp corpus. Directly satisfies AC-004 ("unconfirmed row applies nothing") as a unit assertion rather than an end-to-end archive run. No internal mocks needed — `governedFiles` reads real config, `anchorMatches` is pure.
- **Tradeoffs**:
  - Two modules now describe "what the landing did to the corpus" — `delta.mjs` (declared, verified) and `contribute.syncBack` (touched, stamped). A reader must learn which answers which. Mitigated by scoping `syncBack` explicitly to re-stamping and `delta.mjs` to growth.
  - Archive `SKILL.md` gains orchestration prose. At 68 lines it has room, but the `node -e` one-liner style does not scale to a four-step verify-then-apply; it wants a single entry point (`verifyAndApplyDelta`) invoked once, or the zsh word-splitting landmine gets a second site.

## Candidate B: Extend `contribute.syncBack` in place

- **Summary**: Teach the existing fold-back function about the delta: `syncBack({…, deltaRows})` grows its return from `{applied, proposed}` to `{applied, proposed, confirmed, drift, unclaimed}`. One function, one call site, no new module.
- **API references (current)**: none external. Modifies `contribute.mjs:49`.
- **Fits**: **Partially.** It preserves the single-call-site property archive already has, and `contribute.mjs:57` already filters by `anchorMatches` over `touchedPaths` — the same primitive verification needs. But it violates the one-responsibility-per-file convention the rest of `workspace/` holds to.
- **Tests it enables**: extends `tests/workspace-contribute.test.mjs`. Every new assertion runs through the whole `syncBack` path, so a delta-parsing bug and a stamping bug produce similar failures.
- **Tradeoffs**:
  - **Builds on a known-wrong receipt.** Backlog `syncback-applied-overstates-what-it-stamped-8e21`: `applied[]` counts glob-anchored elements that were never digested — 8 reported, 3 real. Adding `confirmed`/`drift` beside a field that already lies means the new receipt inherits the ambiguity. The backlog's own recommendation is to *partition* the return value first.
  - `syncBack` returns identical output for "you passed me nothing" and "nothing matched" (landmine `zsh-does-not-word-split-…`). Piling delta verification onto an unfalsifiable return is how AC-004 passes vacuously.
  - Forces the fix for `8e21` into this cycle's scope or ships on top of it knowingly. Neither is free.

## Candidate C: `/system-reconcile` owns verification; archive calls it

- **Summary**: Build C2-3 first as the single corpus-integrity engine (gaps, stale, duplicates, unillustrated, missing `@kind`, **and** delta verification), then have `/archive` Step 5 invoke it in apply mode and Step 5.5 in report mode. One engine, two modes.
- **API references (current)**: none external.
- **Fits**: **No — it breaks a standing decision.** The plan states `/system-reconcile` "never repairs mid-workflow" and archive "calls it in report-only mode". An apply mode reachable from archive makes the report-only rule a convention rather than a property, and `corpus-has-one-writer-…`'s re-verification clause turns on exactly this: whether a corpus write is wired into a phase other than the single writer.
- **Tests it enables**: a broad integration surface, but the decisive assertion — "report mode writes nothing" — becomes a behavioural claim about a mode flag rather than a structural one about a module that has no writer.
- **Tradeoffs**:
  - Genuine upside: one place to read for "is the corpus healthy", and the five orphaned APIs get exactly one caller each rather than being split across two consumers.
  - Decisive downside: it collapses the declares/verifies split into one actor. The whole point of C2-2 is that **a scanner-confirmed row becomes a write and everything else is proposed for a curator**. A module with both modes has to enforce that by discipline; two modules enforce it by construction.
  - Also inverts the dependency order the epic needs: the shard writer must exist before archive can write a shard, and the delta section before archive can verify one. C carries the most coupling in the slice that should be smallest.

---

## Recommendation

**Candidate A**, with one amendment: give `delta.mjs` a single orchestration entry point so archive's `SKILL.md` calls it once rather than composing four `node -e` invocations.

Why A over B: the verification receipt is the deliverable. B builds it on `applied[]`, a field measured wrong by 2.7× and structurally unfalsifiable on empty input. A new module starts with a partitioned return (`confirmed` / `drift` / `unclaimed`) and an explicit empty-input signal, which is what the backlog recommends anyway — so A pays the `8e21` debt by not incurring it again rather than by fixing it.

Why A over C: C is the more elegant end state and the wrong sequence. `/system-reconcile` still gets built this cycle and still composes the five orphaned APIs; it just does not own the write path. If a later cycle wants one engine, it can absorb `delta.mjs` — the reverse (splitting a dual-mode engine after archive depends on its apply mode) is the expensive direction.

**What would flip this:**
- If `syncBack`'s partition fix (`8e21`) lands *inside* this cycle anyway, B's cost drops sharply and the two-modules-describe-one-thing objection to A becomes the stronger one. Worth asking at gate A: is `8e21` in scope?
- If the reviewer wants `/system-reconcile` to be the only thing that ever touches `docs/system/`, C is coherent — but that is a change to `corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06`, and it must be recorded as a superseding decision, not slipped in as an implementation choice.

---

## Open questions

Each carries a recommendation; the reviewer decides at `/spec`.

1. **Where does `' @kind` sit relative to `!startsub`?** Content inside the block travels with `!includesub`; content outside does not. A composed diagram that pulls in a shard would carry the annotation as a visible-in-source comment either way, but only the inside placement survives extraction. *Recommend: inside the block, immediately after `!startsub`* — the annotation describes the element the section declares, and `shards.mjs`'s line-anchored regex matches at any depth. A one-line note in the spec prevents the next author from re-deriving it.

2. **Is the `## System delta` table's Witness column authored or derived?** `witness.bindingFor(kind)` already derives a witness from the kind via `project.json → witnesses`. A Witness column that restates it is redundant and can disagree; one that overrides it is a second source of truth. *Recommend: drop Witness from the table and derive it from the kind*, keeping the spec's per-row burden to Verb / Element / Anchor / Concept / Kind. This is a real simplification of the plan's proposed shape and should be an explicit spec decision either way.

3. **Does the empty body `*(none)*` need to be exact?** The guard checks heading presence only; the lint would check the body. A spec touching no governed path must have a cheap, unambiguous way to say so. *Recommend: accept `*(none)*` as the sole legal empty form* — an exact literal is greppable and cannot be confused with an author who left the section blank by accident.

4. **Does C2-5 replace term overlap or rank beside it?** Only 14 of 112 elements carry `source_spec:` (12.5%), so a structural-only path answers 1 question in 8. *Recommend: a separate lane, merged and labelled* — structural hits ranked above term hits with their provenance visible, so a reader can tell a pointer from a coincidence. The 91% hit rate measured above is the argument for labelling rather than for replacing.

5. **Is `syncBack`'s `8e21` partition fix in scope?** It sits directly under C2-2 and flips the A-vs-B recommendation if answered yes. *Recommend: out of scope, recorded* — Cycle 2 is already six slices, and Candidate A routes around the defect rather than through it.

6. **How is the `CLAUDE.md` budget paid?** 84 chars / 57 bytes of slack; the trap has fired twice. The sanctioned payment is relocating existing Article IX narration to `.claude/CONSTITUTION.md` (76,904 bytes today). *Recommend: name the exact clause to relocate in the spec's Rollout prerequisites*, so the amendment slice cannot start without a concrete budget source. This is the one item where "we'll find the space" has already failed twice.

7. **`writeShard` or `writeDiagramShard`?** `tests/helpers/memory-fixtures.mjs` already exports `writeShard(memDir, category, …)` for **memory** shards. *Recommend: `writeDiagramShard`* — the collision is across two subsystems that a single test file plausibly imports together.
