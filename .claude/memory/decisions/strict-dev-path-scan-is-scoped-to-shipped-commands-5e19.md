---
key: strict-dev-path-scan-is-scoped-to-shipped-commands-5e19
category: decisions
scope: [spec, implement]
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: .claude/skills/spec-shippability-review/analyzer.mjs
---

- Decision: the unprefixed dev-only-path form (`STRICT_DEV_PATH_PATTERN`, no `import`, no `node`/`bash` prefix, no leading `./`) is opt-in per scan descriptor via `runDevTreeAndUnshippedChecks(..., {strictDevPaths})`, and ONLY the commands descriptor sets it. The four existing syntax-gated patterns are unchanged everywhere.
- Rationale is categorical, not statistical: a shipped command is a recipe Claude EXECUTES, so a dev-only path inside one is an instruction to read a file the consumer does not have. The same string in a SKILL.md paragraph or in `.claude/CONSTITUTION.md` is a statement about the repository.
- Measured before deciding, which is why the scope is narrow: tree-wide the form hits **74 times across 22 files** (28 in `CONSTITUTION.md` alone), nearly all descriptive prose — at BLOCKER severity that aborts every build on false findings. Restricted to `.claude/commands/**` it hits **8 times with zero false positives**, and all 8 were real defects (one `/init-project` reference plus a second to `src/cli/install.js`, and six in `/init-project-doctor`).
- Rejected alternatives: tree-wide at BLOCKER (74 false findings); tree-wide at ADVISORY (does not gate, so the original defect ships again); matching the English read-verb ("Read the template at …") — measured at 2 tree-wide hits, catching the one instance and missing 6 of the 8, because matching prose is a guess where scoping by surface is a property.
- Cost, accepted deliberately: inside a shipped command even a DESCRIPTIVE dev-path mention must go. `/init-project-doctor` line 72 named the CLI source purely as build provenance and was reworded.
