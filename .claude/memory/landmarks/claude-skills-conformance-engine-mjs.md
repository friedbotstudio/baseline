---
key: .claude/skills/conformance/engine.mjs
category: landmarks
scope: [tdd, integrate, chore]
governs: .claude/skills/conformance/**, .claude/skills/audit-baseline/checks/conformance.mjs
verified-at: 02f3c68
last-touched: 2026-09-02
---

- Role: Domain. `runConformance({fixtureDir, registry})` runs every registered reader over an adversarial fixture and compares each result to a hand-reviewed **golden value**. Re-exports `loadFixture`, `ConformanceUnmeasured`, `MIN_ROWS`, `MIN_READERS`; the Contracts table pins `loadFixture` as an engine export, which is why the split into `fixture.mjs` kept the re-export.
- **Golden values, not reader-agreement.** Agreement is silent whenever readers are wrong together, and silent entirely for a section with one reader. Measured at 02f3c68: all four Acceptance-criteria readers agreed on every real spec in `docs/specs/` while two live bugs went undetected, and the closure-stamp defect had exactly one reader to disagree with.
- **Anti-vacuity floors**, not thresholds: `MIN_ROWS = 9`, `MIN_READERS = 6`. An emptied fixture or an unwired registry throws `ConformanceUnmeasured` rather than reporting a clean run over nothing. See [[coverage-alarm-fixture-derives-zero-elements-9a3c]] for the failure this copies.
- A degenerate-reader sweep reports any reader that saw no row, or was degenerate on every row it saw, under `unmeasured`. A clean `failures: []` with a non-empty `unmeasured` is not a pass.
- `registry.mjs` holds **function references only** and zero patterns. A pattern there would be a second declaration of a grammar the readers already own, which is the alternative this design rejected. Its adapters shape a reader's output into a comparable value; none of them decides what a reader matches.
- Fixture golden values are **hand-reviewed against seed.md §18.9, never captured**. An auto-captured fixture would enshrine whatever the readers do today, including their bugs. Do not regenerate them.
- Front door: `node .claude/skills/conformance/cli.mjs` (`--json` for the full result). Runs under `npm test` and under `audit-baseline`. No SKILL.md by design, matching `.claude/skills/lib/`.
