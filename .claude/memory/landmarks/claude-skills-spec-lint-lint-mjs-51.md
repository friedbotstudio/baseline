---
key: .claude/skills/spec-lint/lint.mjs:51
category: landmarks
scope: [spec, tdd]
governs: .claude/skills/spec-lint/lint.mjs
source: inferred-from-code
verified-at: 8701ae3
last-touched: 2026-08-07
---

- Role: the `/spec-lint` preflight — runs the same checks as the write-boundary hooks against a spec draft without saving, and prints a `check / status / detail` table. Exit 0 CLEAN, 1 FAIL.
- **Five checks print unconditionally**, in `results` order: `plantuml_syntax`, `diagram_presence`, `ac_traceability`, `design_calls`, `system_delta`. `codesign_decisions` is appended only when `workflow.json → codesign_mode` is true.
- **Identify checks by row name, never by ordinal.** The ordinals in this file disagree with print order — `checkCodesignDecisions` is commented "Check #4" but prints last — and `site-src/pm-mode.njk` repeats that "#4" downstream. Any doc that numbers them will drift; `spec-lint/SKILL.md` now numbers nothing.
- `checkPresence(blocks, pj, spec, root)` at :51 is the diagram-presence check. It resolves the write-set-gated profile via `resolveProfile`, then applies the spec-as-diff carve-out: `unresolvedReferences(spec, root)` (:101) FAILs on an `@ref element:<id>` naming no file under `docs/system/elements/`, and a resolvable reference strips `STRUCTURAL_KINDS` from the missing list. Both come from `hooks/lib/write-set-profile.mjs` so the guard cannot disagree — see [[a-rule-shared-by-a-guard-and-its-preflight-lives-in-one-module]].
- `checkSystemDelta(spec, pj, root)` at :230 is the only **exported** check (alongside `checkApiSurfacePinned`), because `plantuml` is on PATH here and a full-CLI test spawns a JVM per fence — the export is what lets the default suite cover it. It reads the opt-in flag from the **passed** `pj`, not from `workspace/flags.mjs`, which resolves from disk by rootDir and cannot answer for the config lint already holds. It returns SKIP when `memory.architecture_map.enabled` is not true; `lint.mjs` ships, and `src/project.template.json` omits that block, so FAIL there would fire on every consumer spec.
- `deltaRowDefects` (:249) resolves `coverage.governedFiles` once per check and only when an `add` row needs it — the walk is whole-tree.
- `root` is `process.env.CLAUDE_PROJECT_DIR || process.cwd()` (:316 `main`), so the whole module can be driven against a sandbox tree by setting that variable.
- `checkSyntax` SKIPs when the `plantuml` CLI is off PATH — expect SKIP on a machine with no JVM.
- Caveat: this key moved from `:48` to `:51` on 2026-08-07 when `system-spec-delta-slice-a` added three imports. Editing this baseline-owned skill drifts its manifest hash; run `npm run manifest:refresh` before the audit's skill-ownership check passes.
