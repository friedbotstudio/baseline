---
key: .claude/skills/audit-baseline/derive-counts.mjs
category: landmarks
scope: [scout]
caveat: TRAP — a "ships in the pristine template" claim derived from the LIVE tree is silently wrong whenever the dev repo carries something the template does not. That is exactly how the site came to assert 9 selectable tracks while `obj/template/.claude/workflows.jsonl` shipped 8 (`org` existed only here). `countTracks(root)` now defaults to `source: 'template'` and falls back to `live` only when the template file is absent; the returned `source` names which tree was read. `deriveCounts()` STRIPS `source` before returning, because its shape is a long-standing contract asserted by strict `deepEqual` — add a field there and the governance tests fail.
verified-at: 1790513
last-touched: 2026-07-27
---

- Path: `.claude/skills/audit-baseline/derive-counts.mjs`
- Role: the DISK DERIVER behind every governance count. Reads hooks/skills/commands/subagents/memory-files/mcp-servers/tracks off disk and exports `deriveCounts(root)`, the hand-maintained `SKILL_CATEGORIES` map (category ASSIGNMENT is editorial; the sum must equal the disk skill count), and the `SPELLED` word map. `site-src/_data/baseline.cjs` consumes it at eleventy build time, so an unmapped `SPELLED` value THROWS during the site build rather than failing the audit — that class is caught at `/integrate`, never at `audit-baseline`. See [[baseline-skill-count-cascade]] and [[baseline-hook-count-cascade-plus-stryker-substring-shipguard]] for the full cascade each count change triggers.
- Two exports added 2026-07-27 (`site-positioning-org-ship`): `countTracks(root, {source})` (template-first, see caveat) and `checkShippedClaims({templateCount, pages})`, a PURE checker — the caller owns IO and passes `[{path, text}]` — that regex-scans rendered pages for `N selectable tracks|canonical shapes|canonical tracks ship in the pristine template` and returns the offenders whose `N` differs from the template count. `site-src/_data/baseline.cjs` correspondingly exposes `tracks.shipped` ALONGSIDE `tracks.canonical`: a shipped claim must bind to `tracks.shipped`, which is what stops the claim from being silently rewired back to a live-tree count.
- Companion: `.claude/skills/audit-baseline/expected-baseline.mjs` (the declared rosters), `.claude/skills/audit-baseline/audit.mjs`, `site-src/_data/baseline.cjs`; tests `derive-counts`, `track-count-truth`, `site-shipped-claims`, `whatsnew-counts`.
