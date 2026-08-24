// T10 — a reference token written as prose is read as a real reference.
//
// REF_TOKEN is /@ref\b[^\n`]*/g. Excluding the backtick stops a token SPANNING
// one, but not a token that STARTS inside one. So a sentence documenting the
// syntax — `@ref element:<element-id>` — matches, fails REF_WELL_FORMED on the
// angle brackets, and forces the full diagram set.
//
// The shipped .claude/skills/spec/template.md trips its own check this way, so
// any spec copied from the template inherits it. Confirmed by running
// hasMalformedReference over the template on disk: true.
//
// The effect is silent. resolveProfile returns the full set and nothing names the
// token that caused it, so an author who draws every diagram anyway sees PASS and
// never learns their reduction was refused.
//
// RED until: the scan masks fenced blocks and inline-code spans, and the malformed
// case names the offending token.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = join(REPO_ROOT, '.claude/hooks/lib/write-set-profile.mjs');
// The `@ref` grammar was split out of the profile resolver when that module
// crossed the size budget; resolveProfile still lives in PROFILE.
const GRAMMAR = join(REPO_ROOT, '.claude/hooks/lib/corpus-reference.mjs');

const projectGet = (dotted) => ({
  '.artifacts.compression.enabled': true,
  '.artifacts.required_diagrams.spec': { c4_context: { min: 1 }, sequence: { min: 1 } },
  '.artifacts.diagram_profiles': [
    { id: 'non_architectural', when: ['docs/**'], required_diagrams: { sequence: { min: 1 } } },
  ],
  '.security.sensitive_globs': [],
}[dotted]);

describe('AC-019 — a reference token inside code formatting is prose, not a reference', () => {
  it('test_when_a_reference_token_is_inside_backticks_then_it_is_not_read_as_a_reference', async () => {
    const { referenceTokens, hasMalformedReference } = await import(GRAMMAR);

    const prose = 'A spec satisfies the structural kinds with `@ref element:<element-id>` naming an element.';
    assert.deepEqual(referenceTokens(prose), [], 'an inline-code span is documentation, not a declaration');
    assert.equal(hasMalformedReference(prose), false, 'documenting the syntax must not read as a typo');
  });

  it('test_when_the_id_slot_is_a_bracketed_placeholder_then_it_is_not_read_as_a_reference', async () => {
    const { referenceTokens, hasMalformedReference } = await import(GRAMMAR);

    const fenced = ['Example:', '', '```', '@ref element:<element-id>', '```', ''].join('\n');
    assert.deepEqual(referenceTokens(fenced), [], 'a placeholder names no element');
    assert.equal(hasMalformedReference(fenced), false, 'and is not a typo either');
  });

  it('test_when_a_fenced_block_carries_a_real_id_then_it_still_counts', async () => {
    const { elementReferences } = await import(GRAMMAR);

    // The template presents the declaration slot AS a fence. Masking fences
    // would deny the carve-out to everyone who copies it and fills in an id —
    // the same silent failure, pointed the other way.
    const declared = ['## Design', '', '```', '@ref element:guard-substrate', '```', ''].join('\n');
    assert.deepEqual(elementReferences(declared), ['guard-substrate']);
  });

  it('AC-020 test_when_the_shipped_spec_template_is_scanned_then_it_does_not_trip_its_own_check', async () => {
    const { hasMalformedReference } = await import(GRAMMAR);

    // The defect's blast radius: every spec copied from this file inherits it.
    const template = readFileSync(join(REPO_ROOT, '.claude/skills/spec/template.md'), 'utf8');
    assert.equal(
      hasMalformedReference(template),
      false,
      'the shipped template must not force the full diagram set on every spec derived from it'
    );
  });
});

describe('AC-019 (safety direction) — a bare reference still counts, well-formed or not', () => {
  it('test_when_a_reference_is_bare_then_it_is_read_exactly_as_before', async () => {
    const { referenceTokens, elementReferences, hasMalformedReference } = await import(GRAMMAR);

    // The safety direction. Masking code spans must not stop the feature working.
    const real = 'Structural kinds: @ref element:guard-substrate\n\nwrite_set: docs/x.md\n';
    assert.deepEqual(referenceTokens(real), ['@ref element:guard-substrate']);
    assert.deepEqual(elementReferences(real), ['guard-substrate']);
    assert.equal(hasMalformedReference(real), false);
  });

  it('test_when_a_bare_reference_is_malformed_then_it_still_forces_the_full_set', async () => {
    const { hasMalformedReference } = await import(GRAMMAR);
    const { resolveProfile } = await import(PROFILE);

    // A real typo must stay the expensive option, never the cheap one.
    const typo = 'Structural kinds: @ref element:Not A Valid Id\n\nwrite_set: docs/x.md\n';
    assert.equal(hasMalformedReference(typo), true, 'a bare malformed token is still malformed');
    assert.equal(
      resolveProfile(typo, projectGet).id,
      'full',
      'a typo must not be the cheapest way to thin a spec'
    );
  });

  it('test_when_only_prose_mentions_the_token_then_the_write_set_decides_the_profile', async () => {
    const { resolveProfile } = await import(PROFILE);

    // With the prose token invisible, the spec is judged like any other: it
    // referenced nothing, so its write_set picks the profile. This grants no
    // structural carve-out — elementReferences is empty — so the direction is
    // "judged normally", never "given credit it did not earn".
    const documented = 'Use `@ref element:<element-id>` to reference.\n\nwrite_set: docs/x.md\n';
    assert.equal(resolveProfile(documented, projectGet).id, 'non_architectural');
  });
});

describe('AC-021 — a malformed reference says so instead of failing silently', () => {
  it('test_when_a_malformed_reference_forces_the_full_set_then_the_reason_names_the_token', async () => {
    const { resolveProfile } = await import(PROFILE);

    const typo = 'Structural kinds: @ref element:Not A Valid Id\n\nwrite_set: docs/x.md\n';
    const profile = resolveProfile(typo, projectGet);

    assert.equal(profile.id, 'full');
    assert.match(
      String(profile.reason ?? ''),
      /malformed/i,
      'the full-set verdict must say a malformed reference caused it'
    );
    assert.match(
      String(profile.reason ?? ''),
      /@ref element:Not A Valid Id/,
      'and must quote the token, so the author can find it'
    );
  });

  it('test_when_the_full_set_is_forced_for_another_reason_then_no_malformed_claim_is_made', async () => {
    const { resolveProfile } = await import(PROFILE);

    // A spec with no write_set also gets the full set. Claiming a malformed
    // reference there would send the author hunting for a token that is not there.
    const noWriteSet = 'A spec with nothing declared.\n';
    const profile = resolveProfile(noWriteSet, projectGet);

    assert.equal(profile.id, 'full');
    assert.doesNotMatch(String(profile.reason ?? ''), /malformed/i);
  });
});
