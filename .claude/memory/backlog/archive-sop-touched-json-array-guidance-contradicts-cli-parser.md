---
key: archive-sop-touched-json-array-guidance-contradicts-cli-parser
category: backlog
scope: [archive]
governs: .claude/skills/archive/SKILL.md
status: open
raised-on: 2026-08-13
raised-in-context: skill-character-doctrine
source: assistant-deferral
deferred: cost
verified-at: e36bcb9
last-touched: 2026-08-13
---

> Pass the paths as one quoted JSON array, never as bare space-separated words.

- `archive/SKILL.md` Step 3 gives the signature `--touched <comma,separated,paths>` then instructs the opposite in bold. `workspace/cli.mjs delta` parses comma-separated.
- Measured 2026-08-13 on one spec and tree: JSON-array form gave confirmed 0 / drift 6; comma-separated gave confirmed 6 / drift 0.
- Worse than a plain error: `inputEmpty` came back false both times, so the field meant to distinguish malformed input from an honest no-match is defeated.
- The honest fix also teaches `cli.mjs` to accept a JSON array; the zsh word-splitting hazard the bold line prevents is real.
