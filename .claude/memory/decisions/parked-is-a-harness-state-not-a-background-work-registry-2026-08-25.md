---
key: parked-is-a-harness-state-not-a-background-work-registry-2026-08-25
category: decisions
scope: []
governs: .claude/hooks/harness_continuation.mjs, .claude/skills/harness/SKILL.md, .claude/skills/swarm-dispatch/SKILL.md, .claude/state/workflow.json
verified-at: 0336688
last-touched: 2026-08-25
source: user-instruction
---

> verbatim (user, 2026-08-24, redirecting the T7 design mid-implementation):
> "actually this seems to be a complicated fix to manage background task and trust me it will bite us later. / here's what I'm seeing. when a swarm is working, the workflow has frozen our main context. The whole point we pushed the work in background so that we can continue on something else no longer holds, and moreover were locked in as well. I think a simple solution can solve this. Before entering swarm mode, disarm harness. a user can rearm by typing harness command but as long as swarm is active (that we can handle by simply adding a Boolean in workflow file, a harness will always yield.... I mean for me adding multiple state files will make this complicated and we have to plan for future. / here's the future, we will have multiple sessions working in the background; and each session will hold 1 active workflow. which means we will have multiple active workflows. As we'll scale this may become complicated, and so let us redesign this solution"

- **Decision: `parked` is a fourth value of the existing `harness_state`, not a new state file.** `harness_continuation.mjs:100` recognises it before Path A and goes silent with `silent: parked (a caller owns this session; /harness rearms)`. A caller that owns the session — `swarm-dispatch` today — declares `parked` on the way in; `/harness` rearms.
- **The rejected design was a background-work registry** (`.claude/hooks/lib/background-work.mjs` plus an `active_wave.json`) that the Stop hook would consult to decide whether to wait or continue. It was written and then deleted. The file does not exist; a `background-work.mjs` candidate reaching `_pending.md` is that dead branch, not a landmark.
- **Rationale — declare, don't detect.** Detection needs a registry, the registry needs a lifecycle, and the lifecycle needs its own recovery path for every way a wave can die. Declaring costs one enum value on a state machine that already exists, and the failure mode is a loop that stays parked rather than one that resumes into a frozen context.
- **Key it by slug, not by session.** The multi-session future in the verbatim is why. Every other state file in `.claude/state/` is keyed by slug; only the session-to-slug binding needs `session_id`. A registry keyed by session would have had to be re-keyed for that future — measured migration cost at the time: 18 hooks and 43 skills.
- Dogfooded the day it landed: the Stop hook fired during a background test suite and went silent as designed.
