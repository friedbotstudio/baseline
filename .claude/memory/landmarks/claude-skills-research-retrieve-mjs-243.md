---
key: .claude/skills/research/retrieve.mjs:243
category: landmarks
scope: [scout]
source: inferred-from-code
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — deterministic, stdlib-only prior-art retriever backing `/research` Step 0 (retrieve-before-derive). `retrieve({root, slug, terms, touchedPaths, specDir})` runs **two lanes** and returns one ordered `hits` array, each hit tagged `via`.
- **Term lane** (`via: "terms"`): substring overlap over archived `research.md` + `spec.md` under `docs/archive/**` plus the `decisions` and `libraries` memory categories. Measured 91% hit rate over 199 sources, so it narrows little on its own.
- **Structural lane** (`via: "source_spec"`, added by `system-spec-delta` slice E): each `touchedPaths` entry resolves through `resolveLookup('by_path', …, {rootDir, specDir})` to the elements governing it; an element's `source_spec:` names the archived spec that authored it. Ranked ABOVE every term hit and never a replacement for them (spec decision D5 — only 14 of 114 elements carry the field).
- Companion: `.claude/skills/research/SKILL.md` Step 0 documents both lanes and the `--touched '["…"]'` one-quoted-JSON-array form. `## Prior art (retrieved)` is where hits get cited, labelled by lane.
- Caveat: the term lane is still fail-open by construction — every filesystem read is try/caught to null, so an empty term result means "no hits OR the corpus was unreachable" and never distinguishes them. Matching is naive lowercased substring containment (not stemmed, not tokenized), so terms under ~4 chars over-match. The **structural** lane does distinguish: `summary.structural` counts what resolved and `structuralUnresolved` names every element whose `source_spec` had no archived `spec.md` on disk (3 of 4 distinct slugs in this repo).
- Security: `source_spec` is file content that becomes a path, so it is validated against `/^[a-z0-9][a-z0-9-]*$/` plus a 128-char cap before any join, and REJECTED rather than normalized — normalizing would silently read a different spec than the corpus named.
- Supersedes the `:82` entry, which named the pre-slice-E single-lane signature at a line that no longer holds the export.
