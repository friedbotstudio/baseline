# Brief — reduce-test-suite-runtime

Captured by `Skill(brainstorm)` at intake Step 0.5. Structured requirement; primary input to the intake template-fill. Six canonical fields in stable order.

## Actor

The developer running the full test suite during the local change → run → result loop. CI is a secondary beneficiary, but the inner development loop is where the slowness is felt.

## Trigger

Every full-suite run done to validate a change — the developer waits on `node --test` (currently `--test-concurrency=1`) before knowing whether the change is good.

## Current state

The full suite takes ~459s wall-clock (down from ~644s after the Part A pass, commit 2afb07c). It is pinned to `--test-concurrency=1` and several tests each run a full template build. The latency pulls the developer out of flow on every iteration.

## Desired state

The suite runs fast enough to stay inside the inner development loop. Aim for ~60s ("~1 minute or whatever least is possible"), pushed as far as practical. This is a direction, not a hard contractual ceiling — take the high-ROI levers and stop at diminishing returns.

## Non-goals

- **No coverage loss.** Every test that runs today still runs. Speed is not bought by deleting or skipping tests to hit a number.
- **Same verdict fidelity.** A green run still means the same thing — no weakening of what is asserted.
- **CI parity.** Whatever runs locally must run identically in CI. No local-only fast path that diverges from the checks CI performs. (A sanctioned env-gated tier is acceptable only if CI runs the full set; the gate must not silently skip checks in the path that gates merges/releases.)

## Solution leakage (captured, NOT commitments)

The request carried four pre-scoped engineering levers from the backlog. Recorded here so the underlying need stays separable from the implementation; `/research` decides whether and in what order to take them:

- Lift the `--test-concurrency=1` pin (requires auditing every test for hidden shared-state writes to the live `obj/template`).
- Build the template once per suite rather than per test file.
- Skip the redundant Stage-4 re-hash after a fresh build.
- Env-gate the npm-pack / install (`publish-check` / `smoke-tarball`) tests behind a flag.

## Open questions

- None unresolved at brief capture.
