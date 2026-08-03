---
key: .claude/skills/audit-baseline/checks/docsite-drift.mjs:1
category: landmarks
scope: [scout]
caveat: LANDMINE (already stepped on once) — the previous version scanned `site-src/hooks.njk` / `site-src/workflows.njk` for literal names, and BOTH branches were wrapped in `if (readText(...))`. Once those pages started building rosters from a `{% for %}` over _data, no name appeared in the template at all; once they were renamed during the site rewrite, the guards went falsy. The check emitted ZERO rows while `audit-baseline` kept reporting PASS — a placebo check, which is worse than a deleted one. Any rewrite of this file MUST assert against the BUILT artifact under `obj/site` and MUST report explicitly when it cannot read one, never silently skip.
verified-at: c4999eb
last-touched: 2026-07-31
---

- Path: `.claude/skills/audit-baseline/checks/docsite-drift.mjs`
- Role: the `audit-baseline` check that every name the baseline ships appears on the rendered page claiming to list it. Reads built HTML under `obj/site` (per `ENUMERATING_PAGES`, keyed by built `url` + a `names` selector) rather than `site-src` templates.
- Shared oracle, deliberately: `deriveNames()` from `../derive-counts.mjs` is the SAME function `site-src/_data/roster.cjs` reads to render those pages, so page and check cannot disagree about what the roster is. The residual risk — an enumerator bug making both wrong together — is covered by `tests/derive-counts.test.mjs`, which re-reads disk directly instead of trusting the enumerator. Do not "simplify" by giving the check its own enumeration; that reintroduces the disagreement this design removes.
- Companions: `.claude/skills/audit-baseline/derive-counts.mjs` ([[claude-skills-audit-baseline-derive-counts-mjs]]), `site-src/_data/roster.cjs`, `tests/derive-counts.test.mjs`, `tests/roster-skill-gloss.test.mjs`.
