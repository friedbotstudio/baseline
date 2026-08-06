---
key: authored-records-are-not-stored-views-2026-08-06
category: decisions
scope: [spec, tdd, integrate]
governs: .claude/skills/workspace/store.mjs,.claude/skills/workspace/render.mjs,.claude/skills/workspace/roll.mjs,docs/system/**
source: engineer decision, gate-A approved 2026-08-06. Spec `docs/specs/central-system-spec.md` §Decisions, second row; clarifies the architecture-map cycle's own ruling rather than reversing it.
verified-at: d4e6216
last-touched: 2026-08-06
---

- **Decision.** Clarifies **D3** of the architecture-map spec (`docs/archive/2026-08-05/architecture-map/spec.md`). Its "no stored views" rule governs a *composed* view — the output of `generateView`, which is still generated on demand and never written, and `readAll().views` still returns empty. An authored record is not a view. Relocating the corpus's records from `.claude/memory/workspace/` to `docs/system/` therefore does not engage that rule at all.
- **Rationale.** The superseded framing was aimed at one hazard: a second artifact that can disagree with the first. A record moved to a different path is the same single source at a new location, so no second artifact exists and nothing can disagree. A committed *rendering* of those records WOULD be the thing the rule forbids, and this cycle deliberately does not create one. Stating the distinction explicitly stops the next reader from re-deriving it — or, worse, from reading the relocation as a violation and "fixing" it by moving the records back into memory.
- **Boundary that still holds.** No composed rendering is ever written to disk. If a future cycle wants a browsable rendered page, that is a new decision with a new hazard analysis, not an extension of this one.
- **Re-verification.** `readAll(specDir).views` must still be an empty array, and no build step may emit a composed view file under `docs/system/`. If either changes, the original hazard is live again and this clarification no longer covers it.
