---
key: read-implementation-and-seed-before-reporting-a-hook-defect
category: landmines
scope: [scout, spec, tdd, security, integrate, rca]
verified-at: e2b7150
last-touched: 2026-08-06
caveat: this is about DIAGNOSIS order, not authority order. Article I.4's precedence (seed.md > CLAUDE.md > implementation) is unchanged and still governs which document WINS. The trap is using the middle layer as the first thing you READ.
---

- Path: `.claude/hooks/*.mjs` header contracts; `docs/init/seed.md` §4.1 hook table; `CLAUDE.md` Article VIII; `.claude/CONSTITUTION.md` per-hook bullets.
- Trap: when a hook's observed behavior contradicts `CLAUDE.md` or its annex, the constitution layer is the layer most likely to be WRONG. It is derived, duplicated across three files, and nothing mechanical reconciles it against the hook. Diagnosing from it produces a confident, false defect report.
- Observed 2026-08-06 (`audit-flake-writer-isolation`): `harness_continuation` emitted its block directive at gate C with `.harness_active` absent and `harness_state: yielded`. Both `CLAUDE.md` Art. VIII ("Three-rung gate … silent otherwise") and `.claude/CONSTITUTION.md:124` ("Silent on any rung fail") said that was impossible, so it was reported to the user as a safety-net misfire and escalated to a claimed hole in the consent gate. Both statements were false. `harness_continuation.mjs:8-20` documents a **Path B** (state=yielded + a consent token newer than `harness_state`), `docs/init/seed.md:145/175/467` specified it in full, and the hook's own log named it: `emit: decision=block (Path B (rung 4, state=yielded + fresh consent))`. Nothing was broken. Full RCA: `docs/rca/2026-08-06-harness-continuation-false-misfire.md`.
- Diagnosis order that works, cheapest first: (1) the hook's decision log under `.claude/state/logs/<hook>.log` — the shipped hooks log which branch they took and why; (2) the hook source's header contract; (3) `docs/init/seed.md`; (4) only then `CLAUDE.md` / the annex, and treat a disagreement there as drift until proven otherwise.
- The same evidence also kills the follow-on claim that a Stop hook could push past a *pending* gate: Path B requires a token mtime newer than `harness_state`, and the log line `silent: rung4 no consent token newer than harness_state` shows it staying silent at the un-satisfied gate minutes earlier.
- Mechanical backstop since 2026-08-06: `.claude/skills/audit-baseline/checks/hook-decision-paths.mjs` FAILs when a hook declares a `Path <X>` label its annex bullet does not name. Coverage is deliberately narrow (1 of 26 hooks use the label convention) and the check reports that count, so the narrowness stays visible instead of reading as a clean sweep.
- Related: [[live-objtemplate-rebuild-races-parallel-test-readers]], [[baseline-skill-edit-needs-manifest-rebuild]].
