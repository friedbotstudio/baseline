# Security reports — skill-character-doctrine

## skill-character-doctrine-2026-08-13.md

# Security Review — main (skill-character-doctrine) — 2026-08-13

## Summary

**Both findings were fixed in this same workflow and re-probed; residual risk is LOW.** The resolution is recorded at the end of each finding, and the original evidence is left intact above it so the report stays readable as a record of what was true when it was written.

Original assessment follows.

Overall risk: **MEDIUM**. Two confirmed findings, both reproduced with probes rather than inferred. One HIGH — the new build-time stamper writes to an attacker-controllable path and breaks the repository's standing `assertSafeSlug` convention, so a PR touching only a JSON data file gains arbitrary file write on any maintainer who runs `npm run build`. One MEDIUM — the new deferral checker copies repository-controlled bytes into finding text that reaches a terminal without stripping control characters, which is the same class this repo fixed in the standup renderer on 2026-08-13. ReDoS was tested and is not present.

## Findings

### [HIGH — RESOLVED] Doctrine key is used as a path segment with no slug validation

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22 (Path Traversal)
- **File**: `scripts/stamp-character.mjs:17-19`, and the same construction read-only at `.claude/skills/audit-baseline/checks/skill-character.mjs:28`

- **Evidence**:

```js
for (const [slug, entry] of Object.entries(doctrine.skills)) {
  const rel = `.claude/skills/${slug}/SKILL.md`;
  const path = join(rootDir, rel);
  if (!existsSync(path)) continue;
  const current = readFileSync(path, 'utf8');
  const stamped = stampOne(rel, current, entry);
  if (stamped === current) continue;
  writeFileSync(path, stamped);
```

  Reproduced. A doctrine entry keyed `../../VICTIM` stamps `<root>/VICTIM/SKILL.md`:

```
changed: [".claude/skills/../../VICTIM/SKILL.md"]
VICTIM stamped? true
```

- **Impact**: `.claude/skills/audit-baseline/character.json` is a pure data file — the kind a reviewer skims. An attacker who lands one key of the form `../../../<path>` gains arbitrary file write, with the maintainer's privileges, at `npm run build` time. The write is not arbitrary *content* (it is a character block appended after a frontmatter fence, and the target must already exist and already have a fence), which bounds the payload but does not bound the target. Overwriting a file the build later executes or ships is the realistic escalation.

  This also **breaks a standing repository convention**. `plan-store` exports `assertSafeSlug` and calls it inside `planPath` so every plan read and write throws *before any path is constructed*; `checker-fanout` calls the same guard at its entry. `harness/SKILL.md` states the rule as **REJECT, never repair** — explicitly warning that `canonicalSlug` is a normalizer, not a validator, and using it here would mask a traversal by silently writing elsewhere. The new writer is the only path-constructing surface in this diff that does not participate.

- **Recommendation**: Import `assertSafeSlug` and call it on every doctrine key **before** `join`, in both `stampAll` and `checks/skill-character.mjs → run`. Reject the whole run on a bad key rather than skipping the entry — a doctrine that contains one malformed key is a doctrine to fix, not to partially apply. Add a scenario asserting a `../` key throws, alongside the existing `test_when_target_dir_absent_then_stamper_skips_it_without_error`, so "absent" and "unsafe" stay visibly distinct outcomes.

- **RESOLVED** (2026-08-13, same workflow). `character.mjs` now imports `assertSafeSlug` from `.claude/hooks/lib/slug.mjs` and applies it twice: `loadDoctrine` validates **every** key before returning, so a single bad key rejects the whole doctrine rather than partially applying it; and a new `skillPathFor(rootDir, slug)` re-asserts before constructing any path. Both `stampAll` and `checks/skill-character.mjs → run` build their paths only through `skillPathFor`, so no caller can reach `join` directly. Re-probed:

```
probe 1 [traversal]: BLOCKED — slug: refusing to build a path from an unsafe slug "../../VICTIM"
probe 1 [traversal]: VICTIM stamped? false
```

  Covered by `tests/stamp-character.test.mjs → test_when_doctrine_key_traverses_then_stamper_rejects_the_whole_run` (which also asserts the guard fires *before* any write lands) and `tests/character-doctrine-audit.test.mjs → test_when_doctrine_key_traverses_then_check_reports_it_and_reads_nothing`.

### [MEDIUM — REMEDIATED] Repository-controlled bytes reach a terminal without control-character stripping

- **OWASP**: A09 - Security Logging and Monitoring Failures | **CWE**: CWE-117 (Improper Output Neutralization for Logs), CWE-150 (Improper Neutralization of Escape Sequences)
- **File**: `.claude/skills/harness/checkers/backlog-deferral.mjs:60-72`

- **Evidence**:

```js
evidence: `${key}: ${reason}`,
message: `Backlog entry \`${key}\` ${reason} — an assistant deferral names why it was left.`,
```

  Reproduced. A backlog entry whose `key:` carries `ESC [2K ESC [1G` and whose `deferred:` carries an ANSI colour plus BEL survives verbatim into the finding:

```
evidence raw: "innocent[2K[1Gskill: `deferred: [31mBOGUS` is outside the closed list"
has ESC? true | has BEL? true
```

- **Impact**: `\x1b[2K\x1b[1G` erases the current terminal line and returns the cursor to column one. A finding rendered into a checker-fanout report can therefore overwrite the line printed before it — forging a passing row, or hiding its own severity, in the operator's view of the verdict. BEL and colour codes are noise by comparison. The attacker needs commit access to a backlog entry, which is a lower bar than it sounds: backlog entries are written automatically by `memory_stop.mjs` from conversation text.

  This is a **known live class in this repository**, not a theoretical one. `.claude/skills/standup/SKILL.md` records the same fix already applied there: "Every rendered detail line is whitespace-collapsed, clipped to 96 characters, and stripped of C0/C1 control characters. Roadmap titles, commit subjects and question bodies are all repository-controlled content on its way to a terminal, and a row title in this repo already runs past 1000 characters." The new checker reproduces the pre-fix behaviour.

- **Recommendation**: Sanitize `key` and the invalid `deferred` value at the point of interpolation — strip C0/C1 (`/[\x00-\x1f\x7f-\x9f]/g`), collapse whitespace, and clip to a bounded length — reusing the standup renderer's helper rather than writing a second copy. Note that the *sanitizer* is the fix; escaping at the render site would leave every future consumer of `findings[].evidence` to remember it independently.

- **RESOLVED** (2026-08-13, same workflow). `backlog-deferral.mjs` gained a local `safe()` that replaces C0/C1 with a space, collapses whitespace, and clips at 96 characters. The order is load-bearing and commented as such: controls become spaces *before* the collapse, because ESC and BEL are not whitespace and `\s+` alone leaves them intact. Both interpolated values — the entry key and the invalid `deferred` value — pass through it, and `artifact.locus` carries the sanitized key. Re-probed:

```
probe 2 [ansi]: evidence = "innocent [2K [1Gskill: `deferred: [31mBOGUS` is outside the closed list"
probe 2 [ansi]: any control char left? false
```

  The ESC bytes are gone; the harmless residue `[2K` is inert text. Covered by `test_when_entry_carries_control_characters_then_finding_text_is_neutralised` (which checks `evidence`, `message`, `suggested_fix`, and `artifact.locus`) and `test_when_entry_key_is_absurdly_long_then_finding_text_is_clipped`.

  **Deliberately not shared with the standup renderer.** `render.mjs`'s `clip` is a private local with the same rule. Two copies now exist. Extracting a shared module for two consumers is the premature abstraction `code-structure`'s laziness ladder warns against — the third use is where it earns its place. The duplication is recorded rather than left silent (see Out of scope).

## Dependencies

No new packages. `package.json` and lockfiles are untouched by this diff. Every module imported by the new code is in-repo: `node:fs`, `node:path`, `node:crypto`, and `spec-diagram-review/oracle.mjs`.

## Checked and clear

Enumerated so "no finding" is distinguishable from "not looked at":

- **ReDoS on the frontmatter regex** (`/^---\r?\n([\s\S]*?)\r?\n---/`, `backlog-deferral.mjs:15`) — measured against unterminated frontmatter at 10k / 40k / 80k characters: 0.3 ms, 0.0 ms, 0.1 ms. The lazy quantifier is anchored at both ends with no adjacent unbounded quantifier, so the quadratic shape recorded in `.claude/memory/landmines/adjacent-unbounded-quantifiers-are-quadratic-even-when-anchored.md` does not apply. The per-line field regex `/^([a-z][a-z0-9_-]*):\s*(.*)$/i` is bounded by line length.
- **Prototype pollution via the doctrine JSON** — `JSON.parse` creates `__proto__` as a plain own property and does not invoke the setter; `Object.entries` then yields it as an ordinary slug that resolves to a nonexistent directory and is skipped. No pollution path.
- **`bodyCommentCount` over untrusted content** (`code-structure/oracle.mjs`) — a single linear pass over `split(/\r?\n/)` with no regex backtracking. Memory is proportional to input, identical to every other file reader in the repo.
- **Secrets** — no tokens, keys, or credentials introduced. The doctrine file contains English prose only.
- **`character.mjs` file read** — `loadDoctrine` joins `rootDir` with a fixed constant relative path (`DOCTRINE_REL`), so the caller controls only the root. No injection surface.
- **Stage 0c build execution** (`scripts/build-template.sh`) — invokes `node` on a repo-relative script guarded by `[ -f ]`, with `$PKG_ROOT` as its only argument. Same trust level as the surrounding Stage 0a/0b invocations; introduces no new execution surface. The traversal above is the payload risk here, not the invocation itself.

## Out of scope / Noted

- `checks/skill-character.mjs:28` builds the same slug-derived path but only reads, and its FAIL details name the slug and a fixed reason rather than any file content. Impact is therefore disclosure-free, but it shares the HIGH's root cause and should take the same `assertSafeSlug` fix in the same change.
- The `deferred:` closed list is duplicated between `backlog-deferral.mjs:13` and `spec-traceability-review/oracle.mjs:38`. Not a vulnerability; a drift risk worth one shared constant in a follow-up.
- The terminal-sanitizer rule now exists twice — `standup/render.mjs → clip` and `harness/checkers/backlog-deferral.mjs → safe`. Both are correct today. A third consumer is the point at which this should move to `.claude/hooks/lib/`, and at that point the two existing copies should be repointed rather than left behind. Queued to backlog with `deferred: cost`.
- **Neither fix widened the write set.** `assertSafeSlug` was imported from an existing Foundation module and the sanitizer stayed local, so no new file was created under `.claude/hooks/lib/` and no spec amendment was needed.

