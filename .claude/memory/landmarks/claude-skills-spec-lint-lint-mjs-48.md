---
key: .claude/skills/spec-lint/lint.mjs:48
category: landmarks
scope: [spec, tdd]
governs: .claude/skills/spec-lint/lint.mjs
source: inferred-from-code
verified-at: d4a1a47
last-touched: 2026-08-06
---

- Role: the `/spec-lint` preflight — runs the same three checks as the write-boundary hooks against a spec draft without saving, and prints a `check / status / detail` table. Exit 0 CLEAN, 1 FAIL.
- `checkPresence(blocks, pj, spec, root)` at :48 is the diagram-presence check. It resolves the write-set-gated profile via `resolveProfile`, then applies the spec-as-diff carve-out: `unresolvedReferences(spec, root)` (:98) FAILs on an `@ref element:<id>` naming no file under `docs/system/elements/`, and a resolvable reference strips `STRUCTURAL_KINDS` from the missing list. Both come from `hooks/lib/write-set-profile.mjs` so the guard cannot disagree — see [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]].
- `root` is `process.env.CLAUDE_PROJECT_DIR || process.cwd()` (:258 `main`), so the whole module can be driven against a sandbox tree by setting that variable.
- The other two checks are `checkSyntax` (SKIPs when the `plantuml` CLI is off PATH — expect SKIP on a machine with no JVM) and `checkTraceability` (every `AC-NNN` row resolves to a real `§Behavior #N`).
