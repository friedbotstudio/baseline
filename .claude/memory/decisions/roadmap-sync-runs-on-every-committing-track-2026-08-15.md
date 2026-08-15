---
key: roadmap-sync-runs-on-every-committing-track-2026-08-15
category: decisions
load_bearing: true
scope: [triage, spec, integrate, document]
governs: CLAUDE.md, docs/init/seed.md, .claude/CONSTITUTION.md, .claude/workflows.jsonl, .claude/skills/roadmap-sync/**
verified-at: 18204a1
last-touched: 2026-08-15
---

- **Decision.** Phase 10.6 `/roadmap-sync` runs on **every** committing track. The `epic` exception is deleted. `CLAUDE.md:73` now reads `| 10.6 | Roadmap sync | /roadmap-sync (every committing track) | roadmap synced (fail-open) |`.
- **Why the exception existed and why it was wrong.** An epic lands discovery, not code, so it has no roadmap row to flip — the phase looked inapplicable. What that missed is that the epic is exactly the thing the plan most needs to hear about: its discovery committed, the plan never learned, and every later child reported itself done into a row that did not exist.
- **The resolution is a second mode, not an exemption.** The phase branches by track: a code-landing track **flips** rows planned→done; the `epic` track **appends** `## Epic N — Title  <emoji>  (<slug>)` plus one row per slice, and stamps the assigned number back into `.claude/state/epic/<slug>.json → roadmap_epic`. That stamp is what lets `/triage` seed each `epic-child` with `roadmap_tasks: ["E<n>-<sliceId>"]`, so the child's own 10.6 flips its row through the ordinary path.
- **The heading tag is the epic slug, and it is the dedupe key.** An epic whose slug already tags a heading is skipped, which is what makes the append idempotent and the ad-hoc backfill safe to re-run.
- **Amendment scope (Article I.4 order).** `docs/init/seed.md` (three sites) → `CLAUDE.md:73` → `.claude/CONSTITUTION.md`, with `src/CLAUDE.template.md` and `src/seed.template.md` resynced by `bash scripts/build-template.sh`. Never hand-edit the two mirrors.
- **It fit the CLAUDE.md budget because it deletes.** Removing "except `epic`" made the row 13 characters shorter; the file went 27,994 → 27,981 against a 28,000 advisory target. An amendment that *adds* to Article IV has no room and needs a different plan.
- Still fail-open: 10.6 never blocks a commit. The roadmap is a plan, never a gate.
