---
key: hooks-edit-cascade
category: landmines
scope: [scout, spec, tdd, security, integrate]
---

- Path: `.claude/hooks/lib/common.sh:1`
- Trap: every guard hook sources this. A breaking change to a helper signature breaks all 14 hooks at once, and Claude Code can't run any tool until they're fixed.
- Mitigation: when editing common.sh, run a `find .claude/hooks -name '*.sh' -exec bash -n {} \;` syntax check across the fleet.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
