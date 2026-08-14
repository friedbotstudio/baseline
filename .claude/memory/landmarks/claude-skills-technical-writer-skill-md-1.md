---
key: .claude/skills/technical-writer/SKILL.md:1
category: landmarks
scope: [scout]
caveat: TRAP — the pass ORDER is load-bearing, not stylistic. Simplifying (`reader-level`) after de-slopping (`humanizer`) reintroduces phrasing the de-slop pass already cleaned, so `humanizer` has to run twice and the second run flattens the prose. The fixed order is draft against the measured corpus profile -> `reader-level` -> `humanizer`. The other failure mode this SOP exists to prevent is writing before knowing — a page drafted from the model's impression of a system is fluent and unfalsifiable, which is exactly what reads as generated. Step 1 (claim -> source path:line -> verified date) is NOT optional, and an unverifiable claim is cut or written as an explicit open question, never softened into a vague sentence.
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/skills/technical-writer/SKILL.md`
- Role: the ORCHESTRATOR of the technical-writing pipeline shipped in `851b454` (skill count 53 -> 56). It owns sequencing and gating; it carries no craft rules of its own. Per CLAUDE.md Article II it declares three mandatory sub-skills: `technical-writing`, `reader-level`, `humanizer`.
- Division of labour: `technical-writer` = what order, what to gather first, what must pass. `technical-writing` = craft rules + per-Diátaxis numeric targets ([[claude-skills-technical-writing-measure-mjs-1]] is its actuator). `reader-level` = grade-level pass ([[claude-skills-reader-level-score-mjs-1]]). `humanizer` = de-slop pass, always last.
- Step 2 picks exactly ONE Diátaxis type (`reference` / `explanation` / `tutorial` / `howto`), which fixes the numeric targets, heading grammar, person and passive rate downstream. Corpus words-per-section: reference ~1,160, explanation ~445, tutorial ~225, howto ~201 — a page with two enormous sections is under-structured.
- Routing: `/document` (Phase 10) routes any page on a documentation surface through this skill; standalone reference goes to `documentation`, tutorials to `technical-tutorials`, other prose to `prose`.
