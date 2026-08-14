---
key: .claude/skills/workspace/delta.mjs:61
category: landmarks
scope: [spec, tdd, archive]
governs: .claude/skills/workspace/delta.mjs,.claude/skills/spec-lint/lint.mjs
source: inferred-from-code
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: parses a spec's `## System delta` table — what the spec DECLARES it changes about the standing model at `docs/system/`. Landed by `system-spec-delta-slice-a` (epic `system-spec-delta`, slice A).
- `parseDelta(specText)` at :61 is the **only** export, and that is deliberate rather than incidental. `verifyDelta`, `applyDelta` and `verifyAndApplyDelta` are named in the epic spec's Contracts table but belong to **slice C**; declaring them here ahead of their implementation would be an Art. VI.1 stub. Expect this file to grow those three, and only those three.
- Return shape `{rows, errors, empty}`. `empty: true` is reserved for the `*(none)*` literal (spec decision D4 — the sole legal empty body). A malformed row lands in `errors[]` and **never throws**: the caller is a preflight that must report every offending row, not die on the first.
- Pure and total — no filesystem, no config, no clock. Validation that needs disk (does this element resolve? is this anchor governed?) lives in `lint.mjs → checkSystemDelta`, not here.
- Row shape is `| Verb | Element | Anchor | Concept | Kind |`. There is deliberately **no Witness column**: `Kind` is authored and the witness derives via `witness.bindingFor(kind)`, so authoring both would restate `project.json → memory.architecture_map.witnesses` where they agree and fork it where they do not.
- Caveat: the `## System delta` heading is matched by a regex here (section capture) AND in `lint.mjs` (presence test). Renaming the section needs both. Collapsing them requires a new export, so it was deferred to slice C, which reopens this file anyway.
- Caveat: this file is covered by the `workspace-corpus` corpus element's **glob** anchor (`.claude/skills/workspace/*.mjs`), so it opened no coverage gap — but glob-anchored elements carry no `anchor_digest`, so nothing witnesses it either. See [[syncback-applied-overstates-what-it-stamped-8e21]].
