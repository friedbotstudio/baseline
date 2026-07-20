---
key: src/.claude/workflows.template.jsonl:1
category: landmarks
scope: [scout]
verified-at: 8e6f904
last-touched: 2026-06-23
---

- Role: Pristine `.claude/workflows.jsonl` shipped by the baseline. Six lines: four selectable tracks (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`) + two sub-tracks (`swarm-implementation`, `tdd-worker-chain`). Each line conforms to `.claude/schemas/workflow-track.v1.json`. Byte-equivalent to pre-§18 hardcoded triage templates per spec AC-016 (`tests/byte-equivalent-migration.test.mjs`). Copied to `<target>/.claude/workflows.jsonl` by `build-template.sh` Stage 2 and CLI install. NEVER_TOUCH at upgrade time.
- Companion: `.claude/workflows.jsonl`, `src/cli/install.js:79`, `scripts/build-manifest.mjs`, `.claude/schemas/workflow-track.v1.json`.
