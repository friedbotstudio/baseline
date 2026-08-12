---
key: shipped-subdirs-under-flat-scan-descriptors-go-unscanned-a3f8
category: backlog
scope: [spec]
status: open
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: .claude/skills/spec-shippability-review/scan-shipped-skills.mjs
---

> The flat-versus-nested finder split has a security dimension: `commands/`, `agents/` and `output-styles/` are scanned top-level only, so a future subdirectory under any of them would ship unscanned — structurally the same blind spot as D4, which is the defect this batch exists to close.

- The gap: `SCAN_ROOTS` gives `commands`, `agents` and `output-styles` the `topLevelScannableFiles` finder. A subdirectory added under any of them ships without ever reaching the analyzer, in the component that gates publishing.
- Why it was not fixed in-batch: collapsing flat and nested into one recursive finder CHANGES BEHAVIOUR. Skills deliberately scan top level only — `references/` and other subdirs there are documentation, not runtime — so a blanket recursion would widen the skills surface too. That is a design decision with its own findings blast radius, not a cleanup.
- Shape of the fix: either give each descriptor an explicit `recursive: true|false` and turn it on for the three flat non-skill surfaces, or add a coverage assertion that fails when a subdirectory appears under a flat-finder descriptor. The second is cheaper and fails loudly rather than silently widening.
- Surfaced during `/simplify` as a `flagged` row and re-raised in the security review's Out-of-scope section.
