---
key: .claude/skills/audit-baseline/character.mjs
category: landmarks
scope: [scout]
governs: .claude/skills/audit-baseline/character.mjs
role: The single render rule for a skill character block. loadDoctrine validates every doctrine key with assertSafeSlug before returning, and skillPathFor re-asserts before any path is built, so no caller can reach join directly. scripts/stamp-character.mjs writes through it and checks/skill-character.mjs verifies through it; a second copy of renderBlock in either caller is a copy that drifts.
source: inferred-from-code
verified-at: 1b4c320
last-touched: 2026-08-20
---


