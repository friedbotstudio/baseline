---
key: src/cli/surface.js:1
category: landmarks
scope: [scout]
caveat: TRAP — this module is deliberately NOT imported by `bin/cli.js`. It is a parallel declaration of the CLI surface, not the runtime authority. `OPTIONS` in `bin/cli.js` stays the single parser truth (six test files sit on it); importing this module there would make a documentation copy edit ship as an npm release and let a bad description string break argv parsing. The two copies are kept honest by set-equality assertions in `tests/surface.test.mjs`, not by a shared import — so editing one without the other fails that test rather than silently drifting.
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `src/cli/surface.js`
- Role: the machine-readable declaration of the `create-baseline` CLI surface — commands, flags, exit codes. The public CLI reference page used to hand-type its flag and exit-code tables, which drifts silently whenever a flag lands in `bin/cli.js`. `site-src/_data/cli.cjs` now reads this module so `site-src/cli.njk` is generated from a declaration that `tests/surface.test.mjs` pins to the real parser.
- Dividing rule: per-flag, per-command and per-code text lives HERE; page-level narrative (what upgrade is for, how the tiers relate) lives in the `.njk`. The test is "would this sentence read oddly inside `create-baseline --help`?" — if yes, it belongs on the page, not in this module.
- Companions: `bin/cli.js` (runtime authority), `site-src/_data/cli.cjs` (eleventy consumer), `site-src/cli.njk` (rendered page), `tests/surface.test.mjs` (the set-equality pin). Same generated-from-disk pattern as [[claude-skills-audit-baseline-derive-counts-mjs]].
