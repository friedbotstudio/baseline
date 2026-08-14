---
key: action-labels-centralized-in-merge-js
category: conventions
scope: [scenario, implement, tdd]
source: code-pattern
convention: User-facing labels for the per-file upgrade-action report live exclusively at `src/cli/merge.js → ACTION_LABELS` (a frozen object mapping each `ACTION_KIND` enum value to a plain-language string) and `ACTION_LABEL_WIDTH` (the `Math.max(...labels.length)` width). Both render paths consume the same map: `bin/cli.js → runPlainUpgrade` (non-TTY) and `src/cli/tui/upgrade.js → run` (TTY dry-run + final report). Adding a new `ACTION_KIND` requires extending `ACTION_LABELS` in the same edit; otherwise the renderer's `?? action.kind` fallback exposes the raw SCREAMING_SNAKE_CASE enum to end users.
why: prior to 2026-05-21 each render site padded `action.kind` directly to 28 cols; users saw `MECHANICAL_MERGE_CLEAN  .claude/...` etc. The centralization keeps the two render paths byte-identical without duplicating the label dictionary, and it gives `/cli-copy-review` a single place to audit instead of every render call site.
applies-to: any new ACTION_KIND added to `src/cli/merge.js`; any new render call site that displays per-file upgrade actions.
verified-at: 8201af6
last-touched: 2026-08-14
---

- how to apply: when introducing a new merge outcome, (1) add the enum to `ACTION_KINDS`, (2) add the label to `ACTION_LABELS` in the same `Object.freeze` block, (3) rebuild — `ACTION_LABEL_WIDTH` recomputes automatically. The rendered docs site (`site-src/cli.njk`'s action table) mirrors the same map manually; update it in the same commit to keep doc/CLI parity.
