---
key: Q-002 — Is `landmarks.md`'s `size-cap: 700` ratified, or a decay-evasion hatch to be reverted to 500?
category: pending-questions
scope: []
raised-on: 2026-07-10
---

- Question: `.claude/memory/landmarks.md` is the only canonical memory file declaring `size-cap: 700`. Every other canonical file — and `src/memory/landmarks.template.md`, its own shipped template — declares `500`. Should the live file be reverted to 500 (forcing a ~40-line prune of the oldest unverified entries), or is 700 a deliberate, ratifiable cap for the landmarks register specifically (in which case the template and `README.md`'s "default 500" line must be updated to match)?
- Evidence: `git log -S` isolates the change to `351d1a8` ("docs: record Phase 0 machine-churn freeze and flip its roadmap status", 2026-07-09), whose commit body mentions landmarks only as "landmarks.md: pending memory flush" — the `size-cap: 500 → 700` line was bundled into an unrelated docs commit and never justified. The template was not updated, so live and shipped now disagree.
- Why it matters: nothing enforces the cap mechanically. `.claude/hooks/lib/memory_session_start.mjs:27` reads each file's OWN declared `size-cap:` from frontmatter and lists over-cap files under `## Files over size-cap`. Raising the frontmatter is therefore sufficient to silence the warning — the file reports `ok` at session start precisely because the cap moved to meet the file. This is the same class of decay-evasion hatch that `memory-flush/SKILL.md` Step 3 records having already removed once ("The prior 'HEAD is permanently fresh on git' semantics was a decay-evasion hatch and was removed").
- Caveat before acting: reverting to 500 means prune surgery on a 67-entry register whose paths all still resolve (66/67 point at extant files; the lone non-path key is `durable-plan-state-subsystem-424f`). That is governance/tooling work, which the `freeze-machine-churn-2026-07-09` decision says not to start unless a product workflow is provably blocked. Nothing is blocked today. Answer this at the next deliberate memory-system pass — it belongs with [[memory-system-redesign-landmines-captured-but-not-honoured-at-decision-point-7f3a]].
- Raised-in-context: (no active workflow) — ad-hoc `/memory-flush` during the stop-notifier correction
