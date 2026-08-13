---
key: binding-test-cmd-is-the-audit-not-the-node-suite
category: backlog
scope: [integrate]
governs: .claude/project.json
status: open
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: dependency
verified-at: e36bcb9
last-touched: 2026-08-13
---

> The binding test command and the test suite the repository actually maintains should be the same thing, or the divergence should be surfaced at every verify rather than known only to whoever reads project.json.

- `project.json → test.cmd` is the governance audit. `/integrate` stamps PASS from it while the node suite carries three red assertions.
- Measured 2026-08-13: audit exit 0 over 138 checks; node suite 2855 tests, 2836 pass, 3 fail.
- RCA AI-01. Blocks honest verification of the other action items.
