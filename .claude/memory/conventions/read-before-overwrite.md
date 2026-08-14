---
key: read-before-overwrite
category: conventions
scope: [scenario, implement, tdd]
source: user-instruction
convention: Before overwriting an existing file (Write, or a truncating edit), Read it in-session first. The Write tool refuses to blind-overwrite a file not read in the current session ("File has not been read yet"); Read-first makes the operation reliable. (Edit already requires a prior Read.)
why: the recurring "Error writing file / has not been read yet" failure, surfaced from the ERP consumer session.
verified-at: 8201af6
last-touched: 2026-08-14
---

- verbatim (user, 2026-07-08): "ensure we read before write (we see this 'Error writing file' all the time)."
- how to apply: any overwrite of an existing file → Read then Write. New-file Writes don't need it.
- placement note: this is the change order §8 FALLBACK home. `docs/handoff/context7-outcome-mandate.md` §8 recommended a CLAUDE.md Article VI.7 + `src/CLAUDE.template.md` mirror so it travels to consumers, but CLAUDE.md was within ~1KB of its 40k hard cap after the context7 VI.5 rewrite, so per §8 the convention lives here instead. The Write-tool enforcement is a harness behavior consumers get regardless; only the doc placement changed. Revisit shipping a VI.7 to the template if the constitution is later trimmed. See [[context7-outcome-not-tool-mandate]].
