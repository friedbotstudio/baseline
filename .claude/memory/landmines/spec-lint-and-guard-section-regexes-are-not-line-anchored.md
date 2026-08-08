---
key: spec-lint-and-guard-section-regexes-are-not-line-anchored
category: landmines
scope: [spec]
verified-at: 32b83c2
last-touched: 2026-07-15
---

- Path: `.claude/skills/spec-lint/lint.mjs` (`checkTraceability` → `acSectionRe = /##\s+Acceptance criteria([\s\S]*?)(?=^##\s|...)/m`) and every `/^##\s+<Section>/im` section extractor in `.claude/hooks/lib/design-calls.mjs` + the spec-review checkers.
- Trap: the section-extraction regexes match `##\s+<Name>` **without a `^` line anchor on the opening `##`** (the `m` flag only anchors the lookahead terminator, not the start). So a **prose mention** of a heading string inside another section — e.g. `` `## Acceptance criteria` `` in a Non-goals bullet or an Alternatives-table cell — is matched FIRST, and the lazy `[\s\S]*?` capture then runs to the next real `^## `, returning a body that does not contain the actual section's rows. Symptom: `ac_traceability FAIL — no AC-NNN rows with a sequence reference` even though the real `## Acceptance criteria` table is perfectly well-formed.
- Live 2026-07-15 (`spec-quality-floor`, B1): two consecutive `/spec-lint` failures, both traced to literal `` `## Acceptance criteria` `` strings in the spec's Non-goals bullet and Alternatives Alt-B cell. Fix was to reword the prose (`the spec's Acceptance-criteria table`), not touch the regex.
- Mitigation (author side): never write a literal `` `## <SectionName>` `` in spec prose — drop the `##` (say "the Acceptance-criteria table"). Mitigation (code side, if ever hardened): anchor the opening `##` with `^` under the `m` flag. Until then, treat a section-matcher FAIL on an obviously-correct spec as a prose-hijack first, a real defect second.

---
