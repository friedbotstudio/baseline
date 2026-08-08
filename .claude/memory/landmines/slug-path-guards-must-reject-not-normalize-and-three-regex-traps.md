---
key: slug-path-guards-must-reject-not-normalize-and-three-regex-traps
category: landmines
scope: [security, tdd]
verified-at: e51a03d
last-touched: 2026-07-12
---

- Path: `.claude/skills/harness/plan-store.mjs:20-31` (`SLUG_RE` + `assertSafeSlug`, called inside `planPath`), vs `.claude/hooks/lib/common.mjs:149` (`canonicalSlug`).
- **Trap 1 — `canonicalSlug` is a NORMALIZER, not a validator. Never use it as a path guard.** It strips everything before the last `/` and drops a `.md` suffix, so `canonicalSlug('../../config')` returns `'config'` — it *silently succeeds*. Wiring it into a path guard would MASK a traversal: the write lands at a different, valid-looking path instead of being refused, and the caller never learns. A path guard SHALL **reject** (throw before the path is constructed), never repair. The two functions look interchangeable at a call site and are not; the repo now has both, so read the name carefully.
- **Trap 2 — JS `$` and Python `$` are NOT the same anchor.** `/^[a-z0-9][a-z0-9-]*$/.test('ok\n')` is **false** in JavaScript (`$` without the `m` flag matches only end-of-input), but Python's `re.match(r'^[a-z0-9-]+$', 'ok\n')` **succeeds** — `$` there also matches before a trailing newline. The guard is correct *because it is in JS*. If this validator (or any anchored-regex validator) is ever ported to Python, it MUST switch to `\Z` or the trailing-newline bypass reopens silently. Verified empirically 2026-07-12, not recalled.
- **Trap 3 — `typeof x !== 'string'` must come BEFORE `RE.test(x)`, not after.** `.test()` coerces its argument, so `RE.test({toString: () => '../../pwned'})` runs the regex against the *coerced* string and a hostile object can slip through a check written as `if (!RE.test(slug)) throw`. Ordering the `||` as `typeof slug !== 'string' || !SLUG_RE.test(slug)` short-circuits the coercion. The ordering is load-bearing, not stylistic.
- Evidence: 29-input adversarial probe run live against the shipped guard (28 rejected: traversal, POSIX + Windows separators, drive letters, NTFS ADS, null bytes, embedded/trailing newlines, URL-encoding, U+2044 / U+FF0F unicode solidus, fullwidth homoglyphs, accented Latin, and every non-string type incl. the `toString` object). The ONE acceptance was an unbounded-length slug (no `{0,63}` cap) — cannot escape the dir, just yields an ugly `ENAMETOOLONG`; logged LOW in `docs/archive/2026-07-12/durable-plan-slug-guard/security.md`.
- Companion: `.claude/skills/harness/SKILL.md` (durable-plan bullet carries the reject-never-repair rule + the load-bearing `persistVerdict` write order). Related: `[[baseline-skill-edit-needs-manifest-rebuild]]` — both guarded files are manifest-hashed, so any edit needs `npm run build`.
