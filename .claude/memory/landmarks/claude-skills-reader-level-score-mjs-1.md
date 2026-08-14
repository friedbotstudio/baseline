---
key: .claude/skills/reader-level/score.mjs:1
category: landmarks
scope: [scout]
caveat: Default target is grade 9 (`DEFAULT_TARGET`), the LOW end of the 9-11 professional band, chosen because baseline prose already spends its readability budget on unavoidable identifiers. Scoring scope is narrowed on purpose — code spans, headings and quoted excerpts are stripped, and HTML input is scoped to `<article class="docs-main">` via `scopeToArticle()`. A path like `.claude/state/spec_approvals/<epic>.approval` is not prose and would wreck a syllable count; a description quoted from a SKILL.md belongs to its source. Widening the scope to "all text on the page" makes the score unactionable, since the author cannot fix what they did not write.
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/reader-level/score.mjs`
- Role: grades a page's reading difficulty and names the specific sentences driving it. Written after a docs page shipped at postgraduate reading level — the prose was accurate and passed every style check, but was built out of long sentences and Latinate abstractions, which no AI-pattern rule detects. This is the gap `humanizer` structurally cannot close.
- Invocation: `node .claude/skills/reader-level/score.mjs [--target N] <file>...`. Exit 0 when every file meets the target, 1 otherwise, 2 on bad usage — so it is usable as a gate, not just a report.
- Pipeline position: runs AFTER content is written and BEFORE `humanizer`. Order is load-bearing — see [[claude-skills-technical-writer-skill-md-1]] for why simplifying after de-slopping forces a second de-slop pass that flattens the prose.
- Companions: `.claude/skills/reader-level/SKILL.md` (the rewriting moves that actually shift the four measures), `.claude/skills/technical-writing/measure.mjs`, `tests/reader-level-score.test.mjs`.
