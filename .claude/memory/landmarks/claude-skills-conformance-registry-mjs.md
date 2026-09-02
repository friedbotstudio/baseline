---
key: .claude/skills/conformance/registry.mjs
category: landmarks
scope: [tdd, integrate]
governs: .claude/skills/conformance/registry.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: the one edge in `.claude/skills/conformance/` that imports readers. 12 registrations, each `{id, artifact, read}` where `read` is a **reference to the real shipped reader**, never a reimplementation.
- The discipline: a pattern in this file is a defect. Re-declaring a grammar here would make the fixture agree with itself instead of with the readers. Two adapters were caught re-implementing their reader during the build and were replaced with exports from the real oracles.
- Adapters exist only to shape a reader's output into a comparable value (a Map into an object, a section string into ids).
- The registry is what the `MIN_READERS = 6` floor in [[claude-skills-conformance-engine-mjs]] guards: an unwired registry must fail loudly, not report clean.
