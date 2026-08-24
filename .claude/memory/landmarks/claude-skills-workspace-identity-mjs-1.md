---
key: .claude/skills/workspace/identity.mjs:1
category: landmarks
rests_on: zero-runtime-dependencies
scope: []
governs: .claude/skills/workspace/identity.mjs, .claude/skills/workspace/materialize.mjs, .claude/skills/workspace/store.mjs, docs/system/elements/**
verified-at: 05d8fec
last-touched: 2026-08-24
---

- Path: `.claude/skills/workspace/identity.mjs`. Foundation — derives a deterministic element id from an anchor. Added by ticket B of `central-system-spec` (2026-08-06).
- Role: `deriveId(anchor)` turns an anchor path or glob into a filesystem-safe element id. Used only where a concept declares a **bare** anchor; where a concept writes `id=path`, the authored id wins and this is not consulted.
- **It exists for merge safety.** `/spec-sync` and concurrent branches both need two derivations of the same anchor to produce the same filename, so a merge sees one file rather than a conflict. Determinism is the whole point; do not make the output depend on scan order, timestamps or the surrounding concept.
- **The hash suffix is unconditional, and that is deliberate.** An earlier draft appended the hash only on collision. `.claude/skills/**` and `.claude/skills/*` both slugify to `claude-skills`, so the conditional form produced a collision whose resolution depended on which anchor was seen first — non-deterministic across branches, which is exactly what the module exists to prevent. Always suffixing costs readability and buys the invariant.
- **Authored ids were kept for the existing corpus.** Re-deriving all 112 would have renamed every file and thrown away semantic names like `slug-safety`. Derivation applies to new bare anchors, not retroactively.
- Defence in depth: `store.writeRecord` and `removeElement` call `assertSafeSlug` independently, so a hostile id cannot reach a path build even if derivation were wrong (`docs/archive/2026-08-06/central-system-spec/security.md`).
- Companions: `.claude/skills/workspace/materialize.mjs` (the caller), `.claude/skills/workspace/concepts.mjs` (where anchors are authored), `.claude/hooks/lib/slug.mjs` (`assertSafeSlug`).
