---
key: drift-check-resolves-acs-by-literal-mention-not-implementation
category: landmines
scope: [tdd, integrate, spec]
governs: .claude/skills/tdd/drift_check.mjs,.claude/skills/harness/**
load_bearing: true
verified-at: 7d7039c
last-touched: 2026-08-26
---

- `drift_check.mjs` marks an acceptance criterion `resolved` when the literal token (`AC-015`) appears in an ADDED diff line. It does not check that the AC's behavior exists. A comment is enough.
- Confirmed 2026-08-04 on ticket E of `living-system-model-abcd`: the drift report read **16/16 resolved, 0 unresolved** while the ticket was half-implemented. `document/SKILL.md` had never been edited, nothing wrote receipts, and nothing invoked the gate. All four ACs "resolved" purely because the test file's header comment said `Covers AC-015..AC-018`.
- So a green drift check proves the AC ids were *mentioned*, not that the feature was *wired*. It cannot distinguish a shipped feature from a well-annotated stub.
- The same session found the same class three more times on the same file: a `require()` in ESM scope (six green tests, crash on first real run, because every test passed `--paths` and the default branch was unexercised), globs that swept the workflow's own spec, and a `--slug` traversal that let a foreign file satisfy the gate. **Every one passed inspection and failed on execution.**
- Practical rule: before trusting drift, name each AC's observable behavior and run it. For a wiring AC ("phase X invokes Y"), the check is a test that greps the consumer for the call, not a mention in the producer.

## 2026-08-05 — two fixes that do NOT close this gap

- `scoreAgainstDiff` now expands `AC-lo..AC-hi` spans, so a header comment reading `(AC-004..AC-008)` resolves all five ids rather than only the two endpoints. This was a real defect (9 of 23 ACs reported unresolved on `architecture-map` while every one had a passing scenario), but read it correctly: it makes the check **consistently** mention-based instead of arbitrarily so. It does not make a mention into evidence. If anything it widens what counts as a mention, so the rule above matters more, not less.
- `EXCLUDED_DIFF_PREFIXES` gained `.claude/state/`. The checker writes its report to `.claude/state/drift/<slug>.md`, that file is untracked, and every row contains an AC id verbatim — so a **second** run scored each id against the first run's own output and the gate silently turned green. It never bit this repo only because `.claude/state/` is gitignored here; a consumer project without that ignore had a drift gate that passed whatever you showed it twice.
- Found by accident: a range test passed for the wrong reason because it invoked the checker three times. A test that runs a checker more than once is a way to catch self-certification — worth reaching for deliberately.
