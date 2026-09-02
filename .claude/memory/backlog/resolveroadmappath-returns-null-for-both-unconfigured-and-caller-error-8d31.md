---
key: resolveroadmappath-returns-null-for-both-unconfigured-and-caller-error-8d31
category: backlog
status: open
scope: [chore, tdd, integrate]
governs: .claude/skills/roadmap-sync/sync.mjs, .claude/skills/roadmap-sync/SKILL.md
source: assistant-deferral
raised-on: 2026-09-02
raised-in-context: gate-fidelity
verified-at: 02f3c68
last-touched: 2026-09-02
---

> A caller who got that argument wrong and did not check would see the identical report either way, and the roadmap would drift silently.

- `resolveRoadmapPath(cfg, repoRoot)` at `.claude/skills/roadmap-sync/sync.mjs:100` returns `null` for two different situations: no roadmap is configured, and the caller passed the wrong argument shape. Its first line is `if (!cfg || typeof cfg !== 'string') return null` — it wants the path string, and an object silently takes the same exit as an absent config.
- `syncRoadmap` then reports `{flipped: [], healed: [], noop: true, anomalies: []}`, which is a clean green over a file it never opened. Phase 10.6 is fail-open by Article IV, so nothing downstream notices.
- Observed live in the `gate-fidelity` workflow's own Phase 10.6: `project.json` was correct and the roadmap file was present, and the first call still reported a clean no-op. Passing `cfg.roadmap.path` resolved it. The second run produced the same empty result for real reasons, so that workflow's outcome was unaffected.
- Same family as the defects `gate-fidelity` closed: a reader whose two outcomes are indistinguishable to its caller, on the phase whose job is keeping the roadmap true. The fix shape is the one that cycle used — make "measured nothing" a distinct, loud outcome rather than a value that reads as success. Compare `ConformanceUnmeasured` in [[claude-skills-conformance-engine-mjs]] and the `inputState` discriminator on the code-review fan-out.
- Consider whether `resolveRoadmapPath` should throw on a non-string `cfg`, or whether `syncRoadmap` should carry a `resolved: false` field the SOP's Step 4 report surfaces.
