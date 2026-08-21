---
key: clip-truncation-can-emit-a-lone-surrogate-9d38
category: backlog
scope: [simplify]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/lib/terminal-text.mjs
deferred: cost
---

> Deferred deliberately: the `/security` phase produces findings and never applies fixes.

- **The defect.** `terminal-text.mjs:20` truncates with `flat.slice(0, width - 1)`, which indexes UTF-16 code units, so a character above the BMP straddling offset 95 is cut in half.
- **Measured.** `clip` of 94 filler characters plus U+1F600 plus one more returns a 96-unit string matching `/[\uD800-\uDFFF]/`.
- **Impact is cosmetic.** Node implements well-formed `JSON.stringify` and escapes a lone surrogate, so it round-trips and no parser downstream of the fan-out breaks. Recorded as LOW because the module's stated purpose is that its output is safe to print, and this is the one input class where it is not.
- **Fix shape.** Slice by code point: `[...flat].slice(0, width - 1).join('')`, or drop a trailing lone high surrogate before appending the ellipsis.
- **Same module, higher severity** as [[clip-neutralises-c0-c1-only-bidi-survives-4f21]].
