---
key: drift-check-resolves-acs-by-literal-mention-not-implementation
category: landmines
scope: [tdd, integrate, spec]
governs: .claude/skills/tdd/drift_check.mjs,.claude/skills/harness/**
load_bearing: true
verified-at: f7da5a7
last-touched: 2026-08-04
---

- `drift_check.mjs` marks an acceptance criterion `resolved` when the literal token (`AC-015`) appears in an ADDED diff line. It does not check that the AC's behavior exists. A comment is enough.
- Confirmed 2026-08-04 on ticket E of `living-system-model-abcd`: the drift report read **16/16 resolved, 0 unresolved** while the ticket was half-implemented. `document/SKILL.md` had never been edited, nothing wrote receipts, and nothing invoked the gate. All four ACs "resolved" purely because the test file's header comment said `Covers AC-015..AC-018`.
- So a green drift check proves the AC ids were *mentioned*, not that the feature was *wired*. It cannot distinguish a shipped feature from a well-annotated stub.
- The same session found the same class three more times on the same file: a `require()` in ESM scope (six green tests, crash on first real run, because every test passed `--paths` and the default branch was unexercised), globs that swept the workflow's own spec, and a `--slug` traversal that let a foreign file satisfy the gate. **Every one passed inspection and failed on execution.**
- Practical rule: before trusting drift, name each AC's observable behavior and run it. For a wiring AC ("phase X invokes Y"), the check is a test that greps the consumer for the call, not a mention in the producer.
