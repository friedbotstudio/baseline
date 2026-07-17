---
key: skill-ownership-frontmatter
category: conventions
scope: [scenario, implement, tdd]
---

- Convention: a `.claude/skills/<slug>/SKILL.md` is baseline-owned iff its YAML frontmatter declares `owner: baseline` on the line directly after `name:`. Every other on-disk skill — those without an `owner:` field, or those declaring `owner: user` — is user/third-party and out-of-scope of baseline audit checks. Absence-of-`owner` is the deliberate default so a project that already has its own skills can install the baseline without annotating any of those files. The build script `scripts/build-manifest.mjs` reads each `owner:` and emits `obj/template/manifest.json → owners.skills` as the canonical baseline-skill enumeration; `audit-baseline` consumes that map and verifies per-file sha256 drift for every baseline-owned skill.
- Why: provenance + zero-friction install. Baseline-owned skills can be re-overlaid by a future `npx @friedbotstudio/create-baseline upgrade` while user-owned skills are left alone. The absence-default policy means a user with 20 pre-existing skills doesn't have to annotate any of them when installing the baseline — only baseline-shipped SKILL.md files carry `owner: baseline`.
- Constraint: a SKILL.md with no `owner:` field is silently skipped (treated as user/third-party). A SKILL.md whose `owner:` value is present but malformed (anything other than `baseline` or `user`) fails the audit with `invalid owner=<value>`. Stripping `owner: baseline` from a baseline-listed slug surfaces as a `hash mismatch` row plus a `missing: [<slug>]` row in the names-match check — never as `missing owner frontmatter` (that error no longer fires).
- Reference: CLAUDE.md Article XI, seed.md §17.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
