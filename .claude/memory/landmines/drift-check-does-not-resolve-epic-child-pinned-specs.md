---
key: drift-check-does-not-resolve-epic-child-pinned-specs
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 922281d
last-touched: 2026-07-03
---

- Path: `.claude/skills/tdd/drift_check.mjs` (spec resolution) vs `workflow.json → pinned_artifacts.spec` on `epic-child` tracks.
- Landmine: `drift_check.mjs --slug <child-slug>` resolves the spec at `docs/specs/<child-slug>.md` only. An `epic-child` workflow has NO spec at its own slug — its contract is the pin `docs/specs/<epic>.md#slice-<id>` — so the checker exits 0 with "no spec; skipped" (the chore-track shape) and NO drift analysis runs against the pinned slice. Mechanically green, semantically unexercised: every epic-child ships without the spec↔impl drift gate the tdd chain assumes.
- First observed 2026-07-03 (`erp-portables-slice-a`, the first epic-child through the tdd worker chain). Nine more children (B..K) will hit this on the same epic.
- Mitigation until fixed: on epic-child tracks, treat the drift-check-tick as vacuous and judge the slice ACs against the binding verify/integrate oracles manually in main context. Real fix (small): teach `drift_check.mjs` to read `workflow.json → pinned_artifacts.spec`, strip the `#slice-<id>` fragment, load that file, and scope the AC scan to the named `## Slice <id>` section.
