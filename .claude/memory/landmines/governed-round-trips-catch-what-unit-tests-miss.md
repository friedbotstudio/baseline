---
key: governed-round-trips-catch-what-unit-tests-miss
category: landmines
scope: [scout, spec, tdd, security, integrate]
file: `.claude/skills/spec-traceability-review/oracle.mjs`, `.claude/skills/harness/graduation-gate.mjs`
symptom: running the oracle checkers on a REAL spec (the §II.A graduation round-trips) produced 9 false-positive BLOCKER findings on a spec that actually traced all its ACs.
root-cause: the traceability oracle's `intake AC N` regex matched only the spaced form; real specs write hyphenated `intake AC-1` / zero-padded `intake AC-001`. The unit test used the spaced form, so it was green. The false positives only appeared against the real corpus.
significance: this IS the seed.md §II.A clause-7 graduation value working — the governed round-trip caught the false positive BEFORE the Article II amendment landed, fixed (broadened separator + regression test) before ratification. Exactly the "two LLMs agree on a hallucination" class the gate exists to prevent.
lesson: oracle-bound checkers must be validated against a REAL corpus, not just synthetic fixtures; the graduation gate (≥3 governed round-trips on real specs, 0 false-positive blocks) forces this. See [[diagram-profile-reduction-was-dead-on-arrival]] — same test-vs-reality gap class.
verified-at: 9ba38f1
last-touched: 2026-06-22
---


