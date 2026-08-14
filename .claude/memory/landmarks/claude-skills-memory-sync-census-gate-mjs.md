---
key: .claude/skills/memory-sync/census-gate.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/memory-sync/census-gate.mjs
role: measureCensusMovement re-measures the census literals a flush moves, or refuses and names the site. Refusing is a first-class outcome, not a failure. KNOWN GAP as shipped 2026-08-14 - literalPattern only matches the bare `SYMBOL = <digits>` assignment shape, which is the shape its own fixture used and which NONE of this repo's three real census sites use (an assert.equal argument, and two object properties). It refuses correctly and pins nothing real yet. See backlog census-gate-literal-pattern-matches-no-real-site.
source: inferred-from-code
verified-at: 66fcb29
last-touched: 2026-08-14
---


