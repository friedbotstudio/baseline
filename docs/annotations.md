# Tracking annotations

A tracking annotation is a comment in source code that names the memory entry governing that code. When `scout` reads an annotated file, it resolves the named entry and surfaces its first line, so the reason a piece of code has its shape reaches whoever is about to change it.

Two gates stand in front of placement, and both must open. The project must set
`memory.annotations.enabled` to `true` — it ships `false`, so a project that has not opted in gets no
annotations at all. The governing decision must then carry the `load_bearing:` marker described below.
In practice the second gate leaves a handful of annotated sites in a repository with hundreds of
decisions, which is the intended ratio: annotate where a maintainer would otherwise confidently break
something.

## Syntax

Two forms are recognised, both parsed by `resolveAnnotation` in `.claude/skills/workspace/refs.mjs:44`:

| Form | Resolves against | Example |
|---|---|---|
| `@decision:<key>` | `.claude/memory/decisions/` | `@decision:decay-is-per-category-three-reasons-2026-08-04` |
| `@constraint:<key>` | `.claude/memory/constraints/` | `@constraint:zero-runtime-dependencies` |

The key is the entry's stable `key:` field, which may differ from the shard's filename. Everything after the colon through end of line is taken as the key and trimmed.

Write the annotation in whatever comment syntax the host language uses. The parser reads the annotation token and ignores its surroundings, so a `#` comment in shell and a `//` comment in JavaScript behave identically.

```js
// @decision:decay-is-per-category-three-reasons-2026-08-04
const STALE_EXEMPT = new Set(['backlog']);
```

## Resolution

`resolveAnnotation(memDir, ref)` returns a plain object in both directions, and it will not throw. A hit carries the entry's first substantive line as `hook`, which callers show inline:

```
{"resolved":true,"key":"decay-is-per-category-...","hook":"Decision: memory decay is a per-category property with three distinct reasons."}
```

If the key names no entry, the result carries the key that failed, so the caller can say which annotation went stale:

```
{"resolved":false,"key":"no-such-entry"}
```

That shape exists so `scout` can report a dangling annotation. An annotation pointing at a deleted or renamed entry asserts that a reason exists and then sends the reader nowhere, which is the one outcome worth being loud about (silence would let it rot indefinitely).

## The feature flag

`annotationsEnabled({rootDir})` in `.claude/skills/workspace/flags.mjs` reads `memory.annotations.enabled` from `.claude/project.json`. The flag ships `false`. Any value that is not the boolean `true` reads as `false`, including an absent key, a `null`, and the string `"true"`. A missing or malformed config also resolves `false` rather than throwing, so a project that never opted in is never interrupted by it.

`code-structure` consults this before considering placement at all. When it reads `false`, nothing is annotated and the marker below is never reached.

## The placement gate

Once the flag is on, `annotationPlacementAllowed(memDir, key)` in `.claude/skills/workspace/placement.mjs:33` decides whether a site may be annotated. It returns `true` when the named decision carries `load_bearing: true`. When the marker is absent, and when it reads `false`, placement is declined.

The marker records that a named constraint forces the shape, rather than someone having merely chosen it. That distinction is what keeps the annotated set small: most decisions apply somewhere, while only a few describe code a maintainer would break by accident. If you find yourself wanting to annotate broadly, the marker is doing its job by refusing.

## Setting the marker

The engineer sets the marker. Claude may propose one, and `proposeLoadBearing` returns the rationale for judgement without touching the entry:

```
{"written":false,"key":"...","rationale":"demo","reason":"awaiting engineer confirmation"}
```

Passing `confirmed: true` writes `load_bearing: true` into the entry's frontmatter and returns `{"written":true}`. The guard tests `confirmed !== true`, so any truthy value short of the boolean will still be refused — a gate that accepts a truthy accident has stopped being a gate.

Keys must pass `assertSafeFactKey` before any path is constructed. Should a key attempt to escape its directory, the call throws and nothing is written:

```
unsafe fact key/filename slug (REJECT, never normalize): "../escape"
```

## Unsupported forms

`@research:<path>` is unsupported, and deliberately so. A research document is addressed by path under `docs/research/`, while the resolver looks entries up by key, so routing research references through it would mark every one of them dangling — a louder failure than simply declining the form. Any unrecognised form resolves to `{"resolved":false,"key":null,"reason":"not an annotation"}`.

Supporting research references would need a path resolver alongside the key lookup. That work is recorded as follow-up.
