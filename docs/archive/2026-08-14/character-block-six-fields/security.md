# Security reports — character-block-six-fields

## character-block-six-fields-2026-08-14.md

# Security Review — main (character-block-six-fields) — 2026-08-14

## Summary

Overall risk: **LOW**. The change is build-time only — no network, no runtime input, no new dependency, no secret, no auth or crypto surface. One real MEDIUM finding: `renderBlock` interpolates doctrine field values into a sentinel-delimited block without rejecting values that contain the terminator, so a malformed entry silently produces unreviewed prose inside a shipped `SKILL.md` and breaks stamp idempotency. The input is maintainer-trust source, so this is a robustness/integrity defect rather than a privilege boundary, but the codebase's sibling writers already reject exactly this class of value.

## Findings

### [MEDIUM] `renderBlock` does not reject a field value containing the block terminator

- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-74 (Improper Neutralization of Special Elements in Output Used by a Downstream Component)
- **File**: `.claude/skills/audit-baseline/character.mjs:44-56` (`renderBlock`)
- **Evidence**:
  ```js
  export function renderBlock(entry) {
    const lines = [BEGIN, '', '## Character', ''];
    for (const [key, label] of PARTS) {
      const value = entry?.[key];
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`character entry is missing ${key}`);
      }
      lines.push(`- **${label}.** ${value.trim()}`);
    }
    lines.push('', END, '');
  ```
  The only check is presence and non-blankness. A value containing `<!-- character:end -->` is interpolated verbatim.

- **Impact**: Reproduced against the live module. With `resolve` set to a value containing the end sentinel followed by markdown, `stampSkill` writes a `SKILL.md` in which:
  1. `extractBlock` terminates the span at the injected sentinel, so the audit compares a **truncated** block against the **full** render and reports `character block drifted from doctrine` — a message that names the wrong cause;
  2. the text after the injected sentinel lands in the file **outside** the character block, i.e. as body prose in a document the model reads as its SOP, having passed through no review;
  3. `stampSkill(stamped, block) !== stamped` — idempotency breaks, so `build-template.sh` Stage 0c rewrites the file on every build and `test_when_run_twice_then_second_run_writes_nothing` would fail.

  This requires write access to `.claude/skills/audit-baseline/character.json`, which is the same trust level as editing the `SKILL.md` directly — so it is **not** a privilege escalation. It is an integrity defect whose failure mode is silent at write time and misleading at audit time.

- **Recommendation**: Reject at the sink, matching the convention this repo already applies to corpus writers (`test_when_element_field_value_carries_a_newline_then_write_is_rejected`, `test_when_technology_or_description_carries_a_quote_or_newline_then_rejected`). In `renderBlock`, after the presence check, throw when the trimmed value contains a newline or either sentinel:

  ```js
  if (/[\r\n]/.test(value) || value.includes(BEGIN) || value.includes(END)) {
    throw new Error(`character entry ${key} contains a block delimiter or newline`);
  }
  ```

  REJECT, never strip — silently removing the sentinel would write a block whose bytes no longer match the authored doctrine, which is the drift the audit exists to catch.

### [LOW] `PARTS` labels are interpolated into a `RegExp` without escaping

- **OWASP**: A03 - Injection | **CWE**: CWE-1333 (Inefficient Regular Expression Complexity), speculative
- **File**: `.claude/skills/audit-baseline/checks/skill-character.mjs:34`
- **Evidence**:
  ```js
  const missing = PARTS.find(([, label]) => !new RegExp(`^- \\*\\*${label}\\.\\*\\* \\S`, 'm').test(found.text));
  ```
- **Impact**: Speculative — all six labels are alphabetic literals authored in `character.mjs`, so no metacharacter reaches the pattern today. A future label containing regex metacharacters would silently change the match semantics rather than fail loudly. Flagged because this change is what made `PARTS` a shared, exported, growable constant.
- **Recommendation**: No action required now. If `PARTS` ever accepts a non-alphabetic label, escape the label before interpolation.

## Dependencies

No package added, removed, or version-changed. `git diff HEAD -- package.json` is empty. The change imports only `node:fs`, `node:path`, `node:crypto`, and `node:test`.

## Out of scope / Noted

- **Path traversal is already closed and unchanged.** `loadDoctrine` calls `assertSafeSlug` on every doctrine key before returning, and `skillPathFor` calls it again — REJECT, never repair. Both legs are covered by `test_when_doctrine_key_traverses_then_check_reports_it_and_reads_nothing` and `test_when_doctrine_key_traverses_then_stamper_rejects_the_whole_run`. This change did not touch either.
- **The MEDIUM finding predates this change** — `renderBlock` never validated field content. This review reports it because the change triples the number of fields carrying the exposure and because spec decision D-5 explicitly settles that `renderBlock` "stays the only validator", which makes its validation scope in-scope for this landing.
- **No trust boundary was added.** The doctrine is read from disk at build and audit time by a maintainer-invoked script. There is no network fetch, no user-supplied input, no deserialization of untrusted data.

