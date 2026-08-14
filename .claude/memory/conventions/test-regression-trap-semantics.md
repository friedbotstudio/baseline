---
key: test-regression-trap-semantics
category: conventions
scope: [scenario, implement, tdd]
source: inferred-from-code
convention: when `/scenario` authors a new test suite, the per-test report must distinguish three pre-implement states: **RED** (test fails as expected, awaiting implement), **PASS_UNEXPECTEDLY** (test passes when it shouldn't — the assertion is probably too soft, or the implementation already accidentally satisfies it), and **REGRESSION_TRAP_PRE_PASSING** (test defends an invariant that must hold both before and after the change, e.g., "key X is absent from the manifest" — passing pre-implement is the correct initial state).
why: the third category is easy to misclassify as PASS_UNEXPECTEDLY, which prompts implement-tick to "fix" a test that's actually working as designed. Surface it explicitly in the `## Written` block so implement leaves it alone.
example: `tests/build-template-build-id.test.mjs` has two tests — one for `GITHUB_RUN_ID` set (RED pre-implement; goes green after stamping logic lands) and one for unset (REGRESSION_TRAP_PRE_PASSING — must continue to pass after implement adds the conditional stamp; ensures the dev manifest stays byte-identical when env is unset).
reference: `.claude/skill-memory/scenario/MEMORY.md` (the originating note, now scratch-only after promotion).
applies-to: `/scenario` per-test report; any TDD pass where an AC is "X is absent" or "X is unchanged".
verified-at: 8201af6
last-touched: 2026-08-14
---


