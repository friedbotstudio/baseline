---
key: archive-leaks-the-swarm-jsonl-overlay-9e52
category: backlog
scope: []
status: open
source: assistant-deferral
raised-on: 2026-08-09
raised-in-context: read-front-door-sweep
verified-at: 7f7b582
last-touched: 2026-08-09
governs: .claude/skills/archive/archive.sh, .claude/skills/swarm-plan/SKILL.md
---

> `swarm-plan/SKILL.md` states the overlay is deleted by `/archive`, but `archive.sh`'s move table has no `.jsonl` row — the two SOPs disagree.

- **The disagreement.** `swarm-plan/SKILL.md` says of the runtime sub-track overlay at `.claude/state/swarm/<slug>.jsonl`: "The overlay is deleted by `/archive` along with the rest of the workflow's swarm state." `archive.sh`'s move table lists `.claude/state/swarm/<slug>.json` but no `.jsonl`, so the overlay survives the archive.
- **Observed.** After `/archive` on `read-front-door-sweep`, `.claude/state/swarm/` still held `read-front-door-sweep.jsonl` while `swarm.json` had moved into the bundle.
- **Why it is not cosmetic.** The harness "reloads runtime overlays from `.claude/state/swarm/*.jsonl` at the same time it reads `.claude/workflows.jsonl`, so the runtime Track set is the union." A leaked overlay means a completed workflow's transient Track is loaded into a LATER session's Track set. It is gitignored, so it never reaches a commit — the leak is into runtime state, not into history.
- **The fix is a decision, not just a line.** `archive.sh` is deliberately move-only ("Never delete artifacts"), so either the overlay joins the bundle as a moved artifact, or `archive.sh` gains a narrow delete for transient runtime state, or `swarm-plan/SKILL.md`'s claim is corrected to say the overlay is left behind. Pick one; today the two documents cannot both be true.
