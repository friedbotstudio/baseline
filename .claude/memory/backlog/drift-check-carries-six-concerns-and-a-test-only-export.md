---
key: drift-check-carries-six-concerns-and-a-test-only-export
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: contracts-rows-resolve-at-drift-check
verified-at: be0a351
last-touched: 2026-08-13
governs: .claude/skills/tdd/drift_check.mjs
---

> `drift_check.mjs` is ~460 lines carrying six concerns, and one of its exports is test-only yet ships to every consumer install.

- **Two findings, one file, both raised at `/simplify` and both out of cleanup scope.**
- **Six concerns in one module.** Spec loading, diff loading, AC scoring, design-call scoring, contract scoring, report rendering, and the CLI `main`. `code-structure` puts the ceiling near 80 substantive lines. The contracts block — `extractContractRows`, `contractTokens`, `probeRunnable`, `scoreInvocation`, `scoreTokens`, `scoreContractRow` — is a clean seam for a sibling `contracts.mjs`, imported and re-exported so existing importers keep working.
- **`sweepArchivedSpecs` is test-only and ships.** Grepped: its only callers are three test assertions. It walks `docs/archive/` recursively and spawns two git subprocesses per archived spec, and no production path calls it. It reaches every consumer inside a baseline-owned module.
- **Moving it is a spec change, not a cleanup.** The approved spec pins it as a Contracts row and AC-008/AC-010 depend on it, so the follow-up must relocate it to `tests/helpers/`, drop the row, and retarget both ACs together. Note the pin is partly circular — the row was added at a correction pass *because* the function already existed.
- **Do not extract mid-workflow.** The drift-check that validated the introducing ticket scored five Contracts rows against exports in this module; moving them invalidates that evidence. Take it as its own ticket with its own drift run.
