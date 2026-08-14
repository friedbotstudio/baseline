---
key: gate-taxonomy-then-debugging-skill-then-v2-9008
category: backlog
scope: []
source: assistant-deferral
status: picked-up
raised-on: 2026-06-05
raised-in-context: v1 thought-compiler design discussion (no active workflow)
estimated-effort: large
parent: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
slice: C (far out — deliberately coarse)
verified-at: c9d8f0e
last-touched: 2026-07-16
caveat: Deliberately coarse — build the gate taxonomy BEFORE any autonomy (vision doc §2.4); the debugging skill makes the explanation-trace the reviewable object (§2.5); v2 is the signal-driven OS riding on a trusted v1 (§2.6, §1.3). Fragment into separate intakes when v1 is proven. Detail: vision doc Part 5.7 piece 8.
governs: .claude/hooks/lib/gate-taxonomy.mjs
superseded-at: 2026-08-14
---

> verbatim (assistant, 2026-06-05):
> "Gate taxonomy → AI-native debugging skill → v2 — safe-vs-ask-a-human classifier, then the explanation-trace debugging UX, then the signal-driven OS. Kept as one far-out stub; fragment when closer."

- progress (2026-07-16, FRAGMENTED): the **gate-taxonomy** third SHIPPED — `.claude/hooks/lib/gate-taxonomy.mjs` (advisory-only classifier, roadmap Epic 3 C6 done). See [[gate-taxonomy-classifier-c6]] + `docs/archive/2026-07-16/gate-taxonomy/`. Entry stays **open**: two thirds remain — (a) AI-native debugging skill (explanation-trace as the reviewable object, §2.5), (b) v2 signal-driven OS (§2.6, §1.3). Also still pending on the taxonomy itself: wiring the classifier into a live decision point once autonomy exists.

---
