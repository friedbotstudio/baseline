# Pattern Research — mutation-testing oracle

The decisive question was whether Stryker can drive a bare `node --test` suite. Verified via context7 (StrykerJS, `/stryker-mutator/stryker-js`, current docs). Two findings shape everything:

1. **Stryker's `commandRunner` runs an arbitrary test command** (default `npm test`) — so it *can* drive `node --test`. (context7: "Command Runner Configuration … `commandRunner.command` — the command to execute for running tests".)
2. **`coverageAnalysis: perTest` is NOT supported by the command runner** — only the Mocha/Jasmine/Karma/Jest plugins support per-test filtering. (context7 verbatim: "Supported test runner plugins include Mocha, Jasmine, Karma, and Jest, but **not the `command` test runner**.") So with bare `node --test` via the command runner, **every mutant re-runs the entire configured test command** — there is no built-in per-mutant test narrowing. This makes *scoping the command itself* the load-bearing lever.

Stryker `mutate` config gives precise file/line scoping (context7: `--mutate src/app/home/home.component.ts` for one file; even `"src/app.js:1-11"` line ranges). `--incremental` re-tests only changed mutants across runs.

## Candidate A: Stryker + command runner, double-scoped (RECOMMENDED)

- **Summary**: Add `@stryker-mutator/core` as a dev-dep. Configure `mutate` to a single target module/file AND set `commandRunner.command` to run only *that module's* test file (e.g. `node --test tests/<module>.test.mjs`). Both axes scoped → per-mutant cost is one fast single-file test run, not the 837-test suite.
- **API references (current, context7-verified)**:
  - `@stryker-mutator/core` (latest major; not yet in lockfile — pins at install) — `commandRunner: { command: "node --test tests/<m>.test.mjs" }` — context7 `/stryker-mutator/stryker-js` configuration.md
  - `mutate: ["src/<file>.mjs"]` (or CLI `--mutate`) for file/line scoping — same source.
  - `coverageAnalysis: "off"` is the only valid setting with the command runner (perTest unsupported) — same source.
  - `--incremental` for changed-files re-runs — incremental.md.
- **Fits**: Yes. Scout flagged Stryker is framework-runner-oriented; the command runner is exactly the documented escape hatch for non-framework suites. Reuses the standard tool (seed.md reuse-before-build). Config-as-data fits the `.claude/project.json` knob pattern for the later tier dial.
- **Tests it enables**: AC-001 (run scoped to a module → survivors reported), AC-002 (vacuous-test fixture → ≥1 survivor), AC-003 (scope = mutate-glob + narrowed command), AC-004 (drives node --test, no framework dep). The oracle wrapper is a pure `.mjs` that shells Stryker and parses its JSON report — unit-testable.
- **Tradeoffs**: No `perTest` optimization, so scope discipline is mandatory (mitigated by the narrowed command). Real dependency footprint — `@stryker-mutator/core` pulls a tree into a meta-repo (dev-only). Coarser than a native runner but correct.

## Candidate B: Home-grown minimal AST mutator

- **Summary**: A small `.mjs` that applies a fixed set of canonical mutations (conditional-boundary, negate-conditional, arithmetic-operator, string/array-literal) to one target file, runs that file's `node --test`, and counts survivors. Zero new dependencies.
- **API references**: none (stdlib only; would use `node:test` + a parser — but a real parser is itself a dependency, or hand-rolled regex mutation which is fragile).
- **Fits**: Partially. Zero-dep is attractive for a meta-repo. But it reimplements what a mature, approved-pattern tool already does well — directly against seed.md "no reimplementing what a dependency provides".
- **Tests it enables**: same ACs in principle, but mutant quality/coverage is whatever we hand-code.
- **Tradeoffs**: Real implementation + maintenance burden; regex mutation is unreliable, a proper AST needs a parser dep anyway (so not truly zero-dep); inferior operator set and reporting. Only justified if Stryker's dependency footprint is ruled unacceptable.

## Candidate C: Stryker + custom node:test runner plugin

- **Summary**: Implement a `@stryker-mutator/*`-style custom TestRunner for `node:test` to unlock `perTest` coverage (run only the tests covering each mutant).
- **Fits**: Best raw performance, enables whole-suite mutation later.
- **Tradeoffs**: Writing a Stryker TestRunner plugin is a large, ongoing maintenance surface — far beyond slice-A piece 3. This is the natural *upgrade path* once the oracle proves useful, not the first cut.

## Recommendation

**Candidate A**, double-scoped (mutate one module + run only that module's test). It reuses the standard tool, the `mutate` config gives exact file scoping, and narrowing the test command compensates for the missing `perTest` so per-mutant cost stays low. Start by dogfooding one pure helper from the scout list (e.g. `.claude/skills/memory-flush/route.mjs` or `brainstorm/discipline.mjs`).

**What flips it:** if `/security` (or the maintainer at codesign) judges the `@stryker-mutator/core` dependency tree unacceptable for this meta-repo, fall back to **Candidate B** (home-grown). If whole-suite mutation across many modules becomes a requirement, graduate to **Candidate C** (custom runner).

## Open questions (for codesign at /spec)

- **Dependency acceptance**: is `@stryker-mutator/core` as a dev-dep acceptable for a repo that ships `.claude/` to consumers (dev-only, not in the shipped template)? This is the Candidate-A-vs-B decision and is a codesign + `/security` call.
- **Scope unit**: changed-files (git diff → mutate globs) vs a named target module argument vs per-skill-dir. Affects the wrapper's CLI.
- **Integration seam**: standalone `npm run test:mutation` + `.mjs` wrapper (lightest; avoids touching skill/hook/command counts) vs a new skill vs a verify sub-check. Recommendation leans standalone script + helper for the first cut.
- **Dogfood target** for AC-002: which single pure helper gets the deliberately-vacuous-test fixture.
- **Survivor report shape/location**: where the advisory `file:line:mutation-kind` output lands (stdout + a `.claude/state/mutation/<scope>.json`?) — must NOT write `last_test_result`.
