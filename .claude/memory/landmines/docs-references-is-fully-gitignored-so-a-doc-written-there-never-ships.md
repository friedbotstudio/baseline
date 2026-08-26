---
key: docs-references-is-fully-gitignored-so-a-doc-written-there-never-ships
category: landmines
scope: [spec, document]
governs: docs/references/**,.claude/skills/document/**,.claude/skills/spec/**
verified-at: 7d7039c
last-touched: 2026-08-26
---

- **The trap.** `docs/references/.gitignore` contains `**/**`. The entire directory is ignored, and `git ls-files docs/references/` returns nothing — `token-efficiency.md` and `task-parity.md` are on disk but untracked. A documentation page written there is invisible to `git status`, never staged, and never reaches a consumer.
- Hit 2026-08-04 on `living-system-model-ef`: the approved spec's `write_set` named `docs/references/annotations.md`, and `code-structure/SKILL.md` was edited to point at it. The doc was written, passed both writing gates, and would have shipped as a dangling pointer for every clone. Moved to `docs/annotations.md` (tracked, same `doc-page` surface, same `technical-writer` requirement) and the pointer updated.
- **Practical rule.** Before a spec commits a `write_set` path under `docs/`, run `git check-ignore -v <path>`. `docs/references/` is local-only reference material; committed documentation goes to `docs/*.md` or `docs/runbooks/**`.
- **Compounding factor:** `document-gate.mjs` derives changed files from `git diff`, so an untracked new page is invisible to it too. The gate reported `no documentation surface in the diff — CLEAN` both before the page existed and after it was created. Only `--paths <file>` made it evaluate. A gate that cannot see the file it governs cannot enforce anything about it.
