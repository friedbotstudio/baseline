---
key: reader-level-grades-rendered-html-so-markdown-passes-vacuously
category: landmines
scope: [document]
governs: .claude/skills/reader-level/**,.claude/skills/technical-writer/SKILL.md,.claude/skills/document/**
verified-at: 8201af6
last-touched: 2026-08-14
---

- **The trap.** `.claude/skills/reader-level/score.mjs:36` extracts prose with `src.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)` — it grades **rendered HTML**. Run against a markdown source file it finds zero paragraphs, prints `no prose paragraphs found`, and then prints `all files at or below grade 11` and exits 0.
- That second line is a vacuous pass. Nothing was measured.
- **Why it bites.** `technical-writer/SKILL.md` Steps 4 and 6 both prescribe running it on `<file>`, and `project.json → document.surfaces` sets `reader_target: 11` on `doc-page` surfaces matching `docs/*.md` and `docs/references/**` — all markdown. So the configured reader-level target for every documentation page is enforced by a gate that cannot read those pages. Confirmed 2026-08-04 writing `docs/annotations.md`.
- **What actually holds the line** is `technical-writing/measure.mjs`, which parses markdown and which `technical-writer` correctly calls "the binding one". On that same page measure caught a real defect (`negationDefPer1k` at 13.8 vs corpus 1.3) and scored 25.42 against a 4.5 threshold while reader-level reported clean.
- **Practical rule.** Treat a reader-level pass on a `.md` file as no evidence at all. Grade markdown with `measure.mjs`; use `reader-level` on rendered site HTML under `obj/site/**`, which is what its `excerpt` / `cell-note` / `step-note` class filters were written for.
- Third false-clean oracle found in one session, with [[drift-check-resolves-acs-by-literal-mention-not-implementation]] and [[security-oracle-reads-any-high-heading-as-an-open-finding]]. The common shape: an oracle that reports success when its input is a form it cannot parse.

- load_bearing: true
