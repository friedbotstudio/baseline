# Central system spec

`docs/system/` exists so you can find out what this system is made of without reading the whole of it. `scout` reconciles against this model instead of rediscovering the codebase every cycle, and a per-work spec points at an element rather than redrawing it.

It is a spec artifact, not memory. It lives under `docs/`, `CANONICAL` stays at eight categories, and `everyShardFile()` never walks it. Memory self-heals and gets re-verified whenever something cites it. This is reviewed instead, and a change to it lands through the same gates as any other spec change.

The layer sits behind `memory.architecture_map.enabled`, which defaults to false and ships absent from the template. A consumer install reads false and behaves as it did before, until it opts in. A project that is not this one builds its own corpus with `/spec-sync`, which proposes a concept map from a scan and materializes only after a human confirms it.

| Directory | Holds | Count |
|---|---|---|
| `elements/` | component records, each anchored to a path or a glob | 117 |
| `concepts/` | cross-cutting concept nodes, no anchor | 15 |
| `diagrams/` | one PlantUML shard per element | 117 |

`readme-gate.mjs` reads that Count column and fails the suite when a number disagrees with the directory it names. It checks both directions: a count that is too low is as untrue as one that is too high. `verifyAndApplyDelta` writes that column. It counts the directory again on every confirmed `add` row it applies, in the same call, so the fold cannot leave its own README wrong.

## Authoring

Concepts are the authored layer. Each concept file carries an `anchors:` list in its frontmatter. Every entry is either `id=path`, which keeps an id a human chose, or a bare `path`, whose id is derived. Whichever concept declared an anchor decides where that element belongs. An anchor declared by two concepts yields one element that belongs to both.

To add an element, add its anchor to the concept that owns it and re-run the materializer. Never write a record by hand:

```
node --input-type=module -e "import('./.claude/skills/workspace/materialize.mjs').then(m=>console.log(JSON.stringify(m.materialize({specDir:'docs/system', rootDir:process.cwd()}),null,1)))"
```

`materialize` has no subcommand, though it writes and the dispatcher exposes eight other writers. Backlog `finish-the-dispatcher-sweep` has not reached the materializer yet, and until it does the inline call above is how it runs.

The materializer refuses before writing anything if an anchor matches no file, so a dangling element never reaches disk.

Coverage is total over the governed surface, and each project declares its own in `project.json` under `memory.architecture_map.governed_surface`. Every code file inside the declared roots has to resolve to at least one element. There is no default: an absent surface is an error, because falling back to some other project's roots would report total coverage over a surface nobody asked about. To see what is uncovered:

```
node .claude/skills/workspace/cli.mjs coverage
```

The dispatcher answers seventeen questions about the corpus. The first nine read and change nothing; the eight below them write.

| Subcommand | Answers |
|---|---|
| `describe <element>` | the record, its shard kind, its owning concepts, its digest state |
| `blast-radius <element>` | what an element depends on, and what depends on it |
| `concept <id>` | a concept's members, and its internal and crossing edges |
| `constraints-for <path>` | which constraints govern a file |
| `coverage` | governed paths no element claims |
| `stale` | elements whose anchor digest drifted |
| `view <concept>` | the composed diagram source |
| `graph [--json]` | every read above as one document |
| `flags` | the three architecture-map flag states |
| `delta --slug <slug>` | verify and apply a spec's declared System delta |
| `digest <element>` | re-stamp one element's anchor digest |
| `shards <element> --kind <kind>` | write one element's diagram shard |
| `restore-shards [--dry-run]` | repair shards a rewrite collapsed |
| `placement <key>` | whether a memory entry is annotated load-bearing |
| `reconcile` | the seven-check corpus drift report |
| `annotations` | scan the governed surface for decision annotations |
| `sync` | propose a concept map from the governed surface |

The writers share the dispatcher with the reads because they answer about the same corpus. Each runs the same contract: validate at the boundary and reject rather than normalize, check the flag gate before writing, and write exactly one thing per invocation.

Run it with no subcommand for that list. Read `graph --json` from another program rather than parsing the human output: its shape is pinned at `.claude/schemas/graph-document.v1.json`, and the conformance test drives its assertions from that file, so the two cannot drift.

Granularity comes from the shape of the anchor rather than a stored field. No anchor means a concept, a glob means a subsystem, a file path means a component. That is why a concept never carries an anchor; one that leaked an anchor would read as a component.

## What an element stores

Beyond its identity and anchor, an element stores exactly one field. `anchor_digest` is a sha256-12 over the anchored file's structural interface rather than its bytes: exported symbols for `.mjs`, sorted key paths for `.json`, heading structure for `.md`. A comment edit or a prose rewrite leaves the diagram alone, while a renamed export marks it stale.

Storing only that one field is a rule rather than an omission. Anything the anchor already implies is worked out at read time instead. Persisting it as well would create a second source of truth that can disagree with the first. A digest is different in kind, since comparing a stored value against a fresh one is the whole mechanism and there is nothing to derive it from. `readme-gate.mjs` fails the build when this file names a field, in backticks, that no element actually carries.

## Staleness and witnesses

Every durable diagram declares what would prove it wrong. A shard names its kind in a PlantUML comment (`' @kind c4_component`). `writeDiagramShard` adds that annotation to every shard it creates, and a backfill has since annotated the shards that predate it. Every shard in `diagrams/` now carries a kind, so no element in this corpus resolves to `witness: none`. `project.json` binds each kind to a witness: a digest comparison, a named test given by `' @witness <path>`, or nothing at all. A diagram with no witness is still permitted, because a project may need to model something no checker can reach. It is marked, though, and can never be cited as evidence.

Detection is mechanical and repair is by hand. `/memory-sync` lists the elements that drifted, and a digest is re-stamped only for one whose record and shard a curator actually read. `stampAll` refuses to run without an explicit id list, so no bulk-refresh path exists. A bulk refresh would leave every element permanently fresh and hide the drift the digest was built to catch.

A glob-anchored element is never stale. It names a family rather than a file, so there is no single interface to digest, and reconciliation reports it as moved.

## Edges, shards, and merges

Edges are derived, never authored. Four scanners read the working tree: relative imports, `.claude/state/` path literals, `projectGet()` config keys, and `Skill()` calls in prose. Each edge carries `provenance: derived`, so no edge rests on a claim a scanner could not check.

A shard delimits its model with `!startsub <id>`, where hyphens become underscores because PlantUML rejects a hyphen in a sub name. Views compose matching shards on demand and are never written; `readAll().views` stays empty.

A rewrite can only add information. `writeDiagramShard` reads the shard already on disk and keeps whichever of `label`, `techn` and `description` the caller left out, so a caller that supplies only the kind changes nothing. That closed a defect that accumulated one workflow at a time: callers under-supplied, so every `/archive` rewrite collapsed a four-argument `Component` line to three and took the element's anchor, its `techn` value and its title with it. Nineteen of 116 shards carried the damage. A rewrite whose result matches the bytes already on disk now writes nothing.

Repair reads git history first and reaches the element record only as a fallback. Element records carry no `techn`. Fifty-one shards declare `subsystem` in that slot while their record reads `kind: component`, and the distinction exists nowhere else on disk, so a record-first repair would have rewritten all 51 and finished what the defect started. Only a shard that was never rich reaches the record, where taking the `label` from the anchor and the `description` from the title costs nothing. A shard with neither a rich blob nor a usable record is reported unrestorable and left byte-identical, because a repair that invents content is a second data loss.

A damaged shard is recognized by fingerprint rather than by argument count: its `label` equals the element id and its `techn` equals its kind, which are the two values the writer falls back to. Three arguments alone is not damage. Two live shards legitimately carry three arguments and real labels, and an early detector that counted arguments reported both as damaged. `tests/corpus-shard-preservation.test.mjs` scans every shard in the corpus and fails if any carries the three-argument form again.

Records are one file per entity with no aggregate index on disk, since the index is rebuilt on every read. Concurrent contributions merge textually and need no merge driver. A derived id is a pure function of the anchor, so two branches deriving the same anchor produce the same filename instead of a conflict. After a merge, `reconcile.repairAfterMerge` reports duplicate anchors and orphan shards and changes nothing. Two meanings sharing one anchor cannot be told apart mechanically, and guessing would destroy one of them.

## Where the reasoning lives

`docs/archive/2026-08-05/architecture-map/spec.md` covers the machinery, `docs/archive/2026-08-06/workspace-corpus-backfill/spec.md` the coverage rule and the curation gate, and `docs/specs/central-system-spec.md` the relocation and the witness model. Genesis: `docs/init/seed.md` §4.8.
