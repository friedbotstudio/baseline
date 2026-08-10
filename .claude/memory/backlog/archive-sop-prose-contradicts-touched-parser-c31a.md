---
key: archive-sop-prose-contradicts-touched-parser-c31a
category: backlog
scope: [archive, chore]
status: open
source: assistant-deferral
raised-on: 2026-08-10
raised-in-context: warm-context-diet
verified-at: 60c5aeb
last-touched: 2026-08-10
governs: .claude/skills/archive/SKILL.md
---

> The prose was added to defeat zsh word-splitting, and the correct advice is one quoted comma-separated string, which is equally immune.

- **The fix.** In `.claude/skills/archive/SKILL.md` Step 3, replace *"Pass the paths as one quoted JSON array, never as bare space-separated words"* with *"Pass the paths as one quoted comma-separated string"*. One sentence.
- **Why.** `queries.mjs → touchedPaths` splits on `,`. A JSON array leaves `[` and `"` on the first and last tokens, so nothing matches and every declared `## System delta` row is reported as `drift` on a landing that was clean. Observed in `warm-context-diet`.
- **The usage line in the same file is already correct** (`--touched <comma,separated,paths>`); only the prose paragraph below it is wrong, which is why it reads as authoritative.
- **Keep the paragraph's point.** It exists because an unquoted `$VAR` of N paths arrives as one space-joined argument under zsh and matches nothing — a real failure the surrounding text calls out as `inputEmpty: true`. A single quoted comma-separated argument is immune to word-splitting in both zsh and bash, so the advice survives the correction.
- **Consider a guard.** `touchedPaths` could reject a value whose first character is `[` with a named error, turning a silent false-drift into a loud one. Cheaper than trusting prose to stay in sync with a parser.
