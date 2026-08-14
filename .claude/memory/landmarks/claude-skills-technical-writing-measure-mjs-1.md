---
key: .claude/skills/technical-writing/measure.mjs:1
category: landmarks
scope: [scout]
caveat: The bands are EMPIRICAL, not invented — `corpus-bands.json` was derived from 113,887 words across 28 documentation pages published before 2022 (SQLite, PostgreSQL 12, Python 3.8, Django 3.2, the Rust book, Effective Go, Pro Git, nginx, Backbone, 12factor, Redis), pre-2022 specifically so the corpus predates LLM-written docs. Do not hand-tune a band to make a failing draft pass; that silently redefines the target. Re-derive from the corpus instead and record it in `references/corpus-profile.md`. `--type` is mandatory and must be one of `TYPES` (reference / explanation / tutorial / howto) — each Diatáxis type has its own band set, so measuring a tutorial against reference bands reports nonsense.
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/technical-writing/measure.mjs`
- Role: measures a documentation draft against the profile of professionally-written technical documentation and reports every axis outside its band. This is the numeric half of the technical-writing pipeline; the craft rules live in `technical-writing/SKILL.md`.
- Invocation: `node measure.mjs --type <reference|explanation|tutorial|howto> [--json] <path>`. Accepts HTML or Markdown. Exit 0 when every axis is inside its band, 1 when any is outside, 2 on usage/IO error — gate-shaped like [[claude-skills-reader-level-score-mjs-1]].
- Companions: `.claude/skills/technical-writing/corpus-bands.json` (the derived per-type bands), `.claude/skills/technical-writing/references/corpus-profile.md` (the derivation), `.claude/skills/technical-writer/SKILL.md` (the SOP that sequences this), `tests/technical-writing-measure.test.mjs` + the `tests/fixtures/technical-writing/` good/slop reference pair.
