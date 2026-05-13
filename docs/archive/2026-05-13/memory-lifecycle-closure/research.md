# Pattern Research — memory-lifecycle-closure

Three candidate approaches for closing the loop on memory lifecycle (resolution semantics + per-entry stale listing + canonical sweep). No third-party library involved — pure architectural / UX decisions on the existing 1-hook + 1-skill + 1-schema-doc surface (scout report). `context7` not invoked.

Each candidate bundles five sub-decisions identified by intake + scout:

| # | Sub-decision | Options |
|---|---|---|
| D1 | Schema shape | universal `resolved-at:` / register-specific (`resolved-at:` + `superseded-at:`) |
| D2 | Closure detection | structured-only / hybrid (structured + prose surface-and-confirm) / prose-only |
| D3 | Stale listing in SessionStart | inline top-N / separate file `_stale.md` |
| D4 | Sweep-canonical placement | Step 0 in `/memory-flush` / Step 6+ in `/memory-flush` / new skill `/memory-prune` |
| D5 | Non-git decay fallback | `last-touched` ISO date ≥ 90d / no decay on non-git / universal `last-touched`-driven decay |

## Candidate A: Minimal — structured-only, single field

- **Summary**: Add one optional field `resolved-at: <ISO date>` to the canonical per-entry shape (applies to all six files; semantics generalized to "this entry no longer applies, by date X"). `/memory-flush` Step 0 sweeps every canonical file for entries carrying that field and removes them. SessionStart index gains a `## Stale entries` block listing the top 5 by oldest `last-touched`. Non-git decay falls back to `last-touched ≥ 90 days`.
- **D1**: universal `resolved-at:`. **D2**: structured-only (no prose regex). **D3**: inline. **D4**: Step 0 in `/memory-flush`. **D5**: date fallback.
- **Fits**: Aligned with scout pattern "field shape inside entry is `- <field>: <value>`" and "absence of field is default for existing entries" (AC-6). One field name on all files matches scout's "field shape is uniform across canonical files."
- **Tests it enables**: Fixture-based — pre-seed an entry with `resolved-at: 2026-05-01`, run `/memory-flush`, assert removal. Snapshot test on hook output for the new `## Stale entries` block. Backwards-compat test: existing entries without `resolved-at:` survive.
- **Tradeoffs**:
  - Strength: minimum schema growth. One field, one regex, one new step. Fastest to implement; smallest blast radius.
  - Strength: avoids the "fuzzy regex on body prose" failure mode (intake landmine: Q-002's resolution prose was buried in a 200-word paragraph that no regex would reliably catch).
  - Weakness: drops intake AC-2 (surface-and-confirm on resolution prose). Today's incident — Q-002 had a `**Resolution path taken**` line but no structured field — would still require manual deletion. Net: the system catches NEW closures (where the user adds the field at resolution time) but not LEGACY ones (where the resolution lives in prose).
  - Weakness: "resolved" is semantically wrong for `landmarks.md` (a file gets renamed or moved, not "resolved"). One field name papers over the register difference; intake Open Q #2 flagged this.

## Candidate B: Hybrid — register-specific fields + prose fallback (recommended)

- **Summary**: Two register-appropriate field names — `resolved-at:` on `pending-questions.md`, `superseded-at:` on the other five canonical files (semantics: open question answered vs. fact invalidated). `/memory-flush` Step 0 auto-closes entries with the structured field AND surfaces entries matching a body-prose regex (`^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date|date)\b` case-insensitive, plus `^Superseded\s+(by|at|on)\b`) for confirm-and-close in the same turn. SessionStart index gains inline `## Stale entries` block, top 5 by oldest `last-touched`. Non-git decay uses `last-touched` ISO date ≥ 90 days.
- **D1**: register-specific. **D2**: hybrid. **D3**: inline. **D4**: Step 0 in `/memory-flush`. **D5**: date fallback.
- **Fits**: Matches intake ACs 1-8 directly (no AC dropped). Aligned with scout's "verbatim blockquote must remain immediately under the heading; new field goes inside the field list" — both `resolved-at:` and `superseded-at:` slot in alongside `verified-at:` / `last-touched:`. Inline SessionStart listing fits the 2KB index cap (5 entries × ~80 chars ≈ 400 bytes).
- **Tests it enables**: Same as A, plus a fixture where the entry has the resolution-prose pattern but no structured field — assert the skill surfaces it for confirmation rather than auto-closing. Plus a fixture pair: one entry with `resolved-at:` on pending-questions.md, one with `superseded-at:` on landmarks.md; assert both close.
- **Tradeoffs**:
  - Strength: covers BOTH new-style structured closure AND legacy prose-style closure. The Q-002 / Q-003 incident would have caught both — Q-002 via prose detection (surfaced, user confirms), Q-003 implicitly resolved by harness work would have needed a manual `resolved-at:` (still better than today).
  - Strength: register-specific names match how each file is actually used. A landmark is invalidated when the file moves; a pending question is resolved when the answer arrives. Documents intent at the field level.
  - Weakness: more schema surface — two field names to document, two regexes to maintain. Adds ~30 lines to README.md and ~40 lines to the skill SOP.
  - Weakness: the prose regex is the failure point. Scout landmine #3 noted "real entries might say 'Resolved 2026-04-29:' or 'Resolution: ...' with different formatting" — the regex must be generous enough to catch common shapes. The mitigation (surface-and-confirm, not auto-close) means false positives don't delete anything; they just add a prompt the user can dismiss.
  - Weakness: implementing the prose-regex path requires reading every canonical body each `/memory-flush` run. On the current memory tree (~500 lines total across six files), the scan is < 10ms — not a concern; flag for future scale.

## Candidate C: Separate skill `/memory-prune`

- **Summary**: Same schema as B (register-specific + hybrid detection). But canonical sweep lives in a NEW skill `/memory-prune`; `/memory-flush` stays scoped to `_pending.md` curation only. SessionStart index gains the stale listing block; the nag line tells the user to run `/memory-prune` for closure/stale or `/memory-flush` for pending. Non-git decay same as B.
- **D1**: register-specific. **D2**: hybrid. **D3**: inline. **D4**: NEW skill `/memory-prune`. **D5**: date fallback.
- **Fits**: Scout pattern "skill-driven, conversational curation" generalizes naturally — `/memory-flush` curates inbox→canonical, `/memory-prune` curates canonical→pruned. Mirrors how `intake`/`scout`/`research`/`spec` are separate skills rather than one mega-skill.
- **Tests it enables**: Same as B, but the audit count check (`audit.sh` skill count) goes from 36 → 37. Article XI manifest gets a new entry.
- **Tradeoffs**:
  - Strength: cleanest separation of concerns. Each skill has a single responsibility. Future evolution (e.g., per-file lifecycle policies, dry-run mode, batch close) can grow inside `/memory-prune` without bloating `/memory-flush`.
  - Strength: user can run `/memory-flush` mid-session without paying the cost of a full canonical sweep (which on a larger tree could be > 1k lines).
  - Weakness: doubles the user surface to remember. Today there's one memory curation command; this adds a second. CLAUDE.md Article III memory check would need to be updated to mention both.
  - Weakness: Article XI skill count bumps. Audit.sh, CLAUDE.md, seed.md, and the README all carry "36 skills" — adding a 37th means updating five places in lockstep per Article XI clause 1 ("declare ownership" + manifest re-derive). Real cost: ~6 file touches before the new skill itself even gets written.
  - Weakness: YAGNI (CLAUDE.md VI.4) — abstracting at one concrete use case violates the "abstract at the third use" rule. The memory tree today is small and the sweep logic is < 100 lines. Hard to argue this needs a second skill yet.

## Recommendation

**Candidate B.** It captures the real register difference between pending-questions (answers arrive) and the other five files (facts get invalidated), keeps the surface to one skill (no Article XI count bump), and covers both structured and legacy-prose closure paths. The hybrid detection is the right answer for the Q-002 / Q-003 incident specifically — auto-close handles future-correctness, prose surface-and-confirm handles legacy.

**What would flip the decision to A**: if the spec review surfaces that the prose-regex maintenance burden outweighs the legacy-coverage benefit (most likely true after a few months when all entries are structured-only). A is the lower-cost, lower-coverage option; revisit at the 6-month mark.

**What would flip the decision to C**: if the canonical sweep grows beyond a single screen of SKILL.md prose. The threshold is "the `/memory-flush` SKILL.md crosses 200 lines" — at that point readability suffers and splitting is justified by code complexity, not by speculative future use.

## Open questions

1. **Exact regex set for prose detection (AC-2).** Memo proposes two patterns:
   `^(\s*-\s*)?\*\*?Resolution\s+(path\s+taken|by|date)\b` and `^Superseded\s+(by|at|on)\b`. Spec should add a third for `^Resolved\s+(by|on|at)\b` and possibly accept inline mentions like `(now resolved)`. Owner: spec.
2. **Should `resolved-at:` and `superseded-at:` mutually exclude?** Probably yes — a `pending-questions.md` entry doesn't get superseded, and vice versa. Spec should document this as a per-file invariant. Audit could optionally enforce it; out of scope here.
3. **Confirmation UX for AC-2 (surface-and-confirm).** When `/memory-flush` finds prose-style closures, does it ask once-per-entry ("close Q-002? y/n") or batch ("found 3 prose-style closures; close all? select?")? UX choice; spec picks.
4. **Stale-listing top-N tie-breaker.** AC-3 specifies "top 5 by oldest `last-touched`." If two entries share a date, what's the secondary sort? Recommendation: alphabetical by `<file>:<key>` for deterministic output.
5. **Hook output exactly matching AC-8.** The new `## Stale entries` block must go AFTER the existing canonical line `HEAD: ... total entries: N · stale (>=30 commits old): M`. Should the block sit before or after the `**N candidates pending in _pending.md**` line? Recommendation: stale block first (it's about long-term state), pending line second (it's the per-session action item). Spec picks final order.
