---
key: src/.claude/workflows.template.jsonl:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Pristine `.claude/workflows.jsonl` shipped by the baseline. Eleven lines: nine selectable tracks (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`, `freeform`, `epic`, `epic-child`, `org`, `power`) + two sub-tracks (`swarm-implementation`, `tdd-worker-chain`). Each line conforms to `.claude/schemas/workflow-track.v1.json`. Byte-equivalent to pre-§18 hardcoded triage templates per spec AC-016 (`tests/byte-equivalent-migration.test.mjs`). Copied to `<target>/.claude/workflows.jsonl` by `build-template.sh` Stage 2 and CLI install. NEVER_TOUCH at upgrade time.
- Companion: `.claude/workflows.jsonl`, `src/cli/install.js:79`, `scripts/build-manifest.mjs`, `.claude/schemas/workflow-track.v1.json`.
