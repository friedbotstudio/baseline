---
key: memory-index-ships-unhashed-while-being-a-shared-oracle-d5b6
category: backlog
scope: [spec]
status: open
source: assistant-deferral
raised-on: 2026-08-12
raised-in-context: consumer-install-defects
verified-at: ce8c7cd
last-touched: 2026-08-12
governs: .claude/skills/memory-index/SKILL.md, .claude/skills/memory-index/categories.mjs
---

> `memory-index` ships but declares no `owner: baseline`, so `categories.mjs` — now the single oracle four modules derive from — is excluded from manifest hash verification. An undetected edit there changes what the build ships.

- Verified 2026-08-12: `.claude/skills/memory-index/` IS present in the built tree, and its `SKILL.md` carries no `owner:` field. Article XII.1 makes absence the deliberate default for user/third-party skills, so the audit excludes it from the baseline count, the names-match check AND the hash-drift check.
- Why it matters more after this batch than before: `categories.mjs → CANONICAL` is now read by `audit-baseline/memory-shape.mjs`, `audit-baseline/expected-baseline.mjs`, `audit-baseline/derive-counts.mjs`, `scripts/build-template.sh` (via `node -e` at build time) and the docs site's `_data/roster.cjs`. Unifying the readers onto one oracle raised the value of that oracle without raising its protection — an edit to it silently changes the shipped memory store and every derived count.
- Open question the ticket must answer, not assume: is the omission deliberate (memory-index treated as project-local tooling) or an oversight? If deliberate, the shared-oracle role has outgrown it. If an oversight, adding `owner: baseline` brings it under hash verification and into the shipped-skills count, which moves a governance number and needs its own count-surface pass.
- Raised in the security review's Out-of-scope section; not touched by that diff.
