# Tracking annotations

A tracking annotation is a comment in source code that names the memory entry governing that code. When `scout` reads an annotated file, it resolves the named entry and surfaces its first line, so the reason a piece of code has its shape reaches whoever is about to change it.

Two gates stand in front of placement, and both must open. The project must set `memory.annotations.enabled` to `true`. It ships `false`, so a project that has not opted in gets no annotations at all. The governing entry must then carry the `load_bearing:` marker described below. In practice the second gate leaves a handful of annotated sites in a repository holding hundreds of decisions, which is the intended ratio: annotate where a maintainer would otherwise confidently break something.

## Syntax

Every canonical memory category has one verb, all parsed by `resolveAnnotation` in `.claude/skills/workspace/refs.mjs`. The verb is the singular of the category name. The map is derived from `CANONICAL`, and the module asserts at load that the derivation covers all eight, throwing if a category has no verb. Adding a ninth category therefore fails loudly at import.

| Form | Resolves against | Example |
|---|---|---|
| `@decision:<key>` | `.claude/memory/decisions/` | `@decision:decay-is-per-category-three-reasons-2026-08-04` |
| `@landmine:<key>` | `.claude/memory/landmines/` | `@landmine:governs-globs-under-a-phase-prefix-never-surface` |
| `@constraint:<key>` | `.claude/memory/constraints/` | `@constraint:zero-runtime-dependencies` |
| `@landmark:<key>` | `.claude/memory/landmarks/` | `@landmark:bundle-mcp-servers-stage-1-7` |
| `@convention:<key>` | `.claude/memory/conventions/` | `@convention:hook-script-shape` |
| `@library:<key>` | `.claude/memory/libraries/` | `@library:context7@mcp` |
| `@backlog:<key>` | `.claude/memory/backlog/` | `@backlog:split-memory-stop-lib-440-lines-8c3d` |
| `@pending-question:<key>` | `.claude/memory/pending-questions/` | *(see below)* |

The key is the entry's stable `key:` field, which may differ from the shard's filename. A token ends at the first space, backtick or quote, so the key must be a single word. Tokens whose key contains `<` or `>` (like the `<key>` in this table's first column) read as documentation placeholders and are skipped.

Because a key must be word-shaped, the last row carries no example. Pending questions are keyed by the question text itself, so `Q-002 — Is ...` can never be named by a token, and that verb stays unusable in practice even though the map defines it. Landmark keys divide along the same line: a slug such as `bundle-mcp-servers-stage-1-7` works, while the many landmarks keyed `<path>:<line>` do not.

In real use `@decision:` and `@landmine:` carry almost every placement. The remaining rows exist because the map covers all eight categories, and annotating a backlog item is rarely a good idea.

Write the annotation in whatever comment syntax the host language uses. The parser reads the token and ignores its surroundings, so a `#` comment in shell and a `//` comment in JavaScript behave identically.

```js
// @decision:decay-is-per-category-three-reasons-2026-08-04
const STALE_EXEMPT = new Set(['backlog']);
```

## Resolution

`resolveAnnotation(memDir, ref)` returns a plain object in both directions and will not throw. A hit carries the entry's first substantive line as `hook`, which callers show inline:

```
{"resolved":true,"key":"decay-is-per-category-...","hook":"Decision: memory decay is a per-category property with three distinct reasons."}
```

If the key names no entry, the result carries the key that failed, so the caller can say which annotation went stale:

```
{"resolved":false,"key":"no-such-entry"}
```

That second shape is what lets `scout` report a dangling annotation. An annotation pointing at a deleted or renamed entry asserts that a reason exists and then sends the reader nowhere, which is the one outcome worth being loud about (silence would let it rot indefinitely).

## Finding them

To locate the references, `scanAnnotations({rootDir, memDir})` in `.claude/skills/workspace/annotations.mjs` walks the tracked files, resolves every annotation it finds, and returns two lists:

```
{"scanned":888,"resolved":[{"file":"...","line":38,"verb":"decision","key":"...","hook":"..."}],"dangling":[]}
```

`scout` runs it at step 0.5, after checking the flag and before it discovers anything. Resolved hits surface for the slice being touched. Dangling ones surface wherever they sit, because an annotation that has gone stale outside your slice is still stale.

Three kinds of path stay out of the walk. Anything under `docs/` is prose about annotations (this page would otherwise report itself). Test paths, taken from `tdd.test_globs`, hold fixtures that dangle on purpose. A token carrying a `<key>` placeholder is documentation. Each exclusion earned its place by a real file tripping it.

Reporting is the whole of the scan's contract. It always exits 0. A dangling annotation lands in the scout report as a finding, and the phase stays green.

## The feature flag

`annotationsEnabled({rootDir})` in `.claude/skills/workspace/flags.mjs` reads `memory.annotations.enabled` from `.claude/project.json`. The flag ships `false`. Any value short of the boolean `true` reads as `false`, including an absent key, a `null`, and the string `"true"`. A missing or malformed config also resolves `false` without throwing, so a project that never opted in stays undisturbed.

Before it considers placement at all, `code-structure` consults this flag. A `false` reading ends the matter, and the marker below is never reached.

## The placement gate

Once the flag is on, `annotationPlacementAllowed(memDir, key)` in `.claude/skills/workspace/placement.mjs` decides whether a site may be annotated. It searches all eight canonical categories and returns `true` when the named entry carries `load_bearing: true`. An absent marker and an explicit `false` both decline.

The marker records that a named constraint forces the shape, where someone merely choosing it would leave no marker. That distinction keeps the annotated set small. Most decisions apply somewhere, while only a few describe code a maintainer would break by accident. If you find yourself wanting to annotate broadly, the marker is doing its job by refusing.

A second rule narrows placement further: annotate only where the entry's `governs:` field names a specific file. An entry governing `.claude/skills/**` has no single site to annotate, and marking every file it covers produces the scatter the marker exists to prevent.

## Setting the marker

The engineer sets the marker. Claude may propose one, and `proposeLoadBearing` hands back the rationale for judgement while leaving the entry untouched:

```
{"written":false,"key":"...","rationale":"demo","reason":"awaiting engineer confirmation"}
```

Passing `confirmed: true` writes `load_bearing: true` into the entry's frontmatter and returns `{"written":true}`. The guard tests `confirmed !== true`, so any truthy value short of the boolean is still refused (a gate that accepts a truthy accident has stopped being a gate).

Whichever category owns the entry receives the marker, so confirming a landmine writes to `landmines/`.

Keys must pass `assertSafeFactKey` before any path is constructed. Should a key attempt to escape its directory, the call throws and nothing is written:

```
unsafe fact key/filename slug (REJECT, never normalize): "../escape"
```

That guard also rejects the landmark register's path-shaped keys, such as `.claude/skills/workspace/placement.mjs:1`, so `/memory-flush` sets those markers. Reading stays unaffected, because the placement gate builds no path: a landmark marked `load_bearing` still authorises placement, and only the propose-and-confirm write path closes to it. Relaxing the guard to admit those keys would reopen the traversal it was added to close.

Where the store is flat, no `<category>/<key>.md` exists to rewrite, so the call reports `{written: false}` with a reason naming the shape.

## Unsupported forms

`@research:<path>` is deliberately unsupported. A research document is addressed by path under `docs/research/`, while the resolver looks entries up by key, so routing research references through it would mark every one of them dangling. Declining the form is the quieter failure. Any unrecognised form resolves to `{"resolved":false,"key":null,"reason":"not an annotation"}`.

The scan reads that result as "this is not an annotation" and skips it silently. `dangling` stays reserved for genuine breakage. Reporting unrecognised verbs would mark every `@research:` reference stale forever, which is noisier than the problem it describes.

Supporting research references would need a path resolver alongside the key lookup. That work is recorded as follow-up.
