// shard-migration-repair — AC-001 (allowlist membership) + AC-002 (allowlist-bounded
// lifting). Covers §Behavior #1.
//
// The defect: migrate.mjs:81 anchored its field regex to lowercase as a HEURISTIC
// separating metadata (`- verified-at:`) from prose labels (`- Path:`). The live
// corpus writes both capitalized, so 254 stamps were stranded in bodies. A naive
// case-insensitive fix would hoist ~420 prose bullets into frontmatter instead.
// The discriminator must be the NAME, bounded by a closed reader-derived allowlist.
//
// RED until: .claude/skills/memory-index/lift-fields.mjs exports LIFTABLE_FIELDS,
// STRUCTURAL_FIELDS, and liftFields().

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryImport } from './helpers/memory-fixtures.mjs';

const LIFT_FIELDS_REL = '.claude/skills/memory-index/lift-fields.mjs';

async function loadLifter() {
  const mod = await tryImport(LIFT_FIELDS_REL);
  assert.ok(mod, `${LIFT_FIELDS_REL} must exist and be importable`);
  return mod;
}

function bodyOf(result) {
  return result.bodyLines.join('\n');
}

function fieldMap(result) {
  return Object.fromEntries(result.fields);
}

describe('lift-fields — allowlist membership (AC-001)', () => {
  it('test_when_liftable_fields_inspected_then_exactly_seven_reader_backed_names', async () => {
    const { LIFTABLE_FIELDS } = await loadLifter();
    assert.ok(LIFTABLE_FIELDS instanceof Set, 'LIFTABLE_FIELDS is a Set');
    assert.deepEqual(
      [...LIFTABLE_FIELDS].sort(),
      ['last-touched', 'raised-on', 'resolved-at', 'source', 'status', 'superseded-at', 'verified-at'],
      'exactly the seven names pinned in the spec Contracts table',
    );
    for (const readerless of ['estimated-effort', 'raised-in-context', 'links']) {
      assert.ok(
        !LIFTABLE_FIELDS.has(readerless),
        `${readerless} has no mechanical reader (or no corpus instance) and must stay out of the allowlist`,
      );
    }
  });

  it('test_when_structural_field_bullet_then_dropped_not_lifted', async () => {
    const { liftFields, STRUCTURAL_FIELDS } = await loadLifter();
    assert.deepEqual([...STRUCTURAL_FIELDS].sort(), ['category', 'key', 'scope']);
    const result = liftFields('- key: some-key\n- category: landmines\n- scope: [spec]\n- Trap: keeps biting\n', {});
    assert.deepEqual(fieldMap(result), {}, 'structural names are dropped, never lifted — the preamble owns them');
    assert.equal(bodyOf(result), '- Trap: keeps biting', 'non-structural prose survives untouched');
  });
});

describe('lift-fields — allowlist-bounded lifting (AC-002)', () => {
  it('test_when_metadata_bullet_any_case_then_lifted_to_frontmatter', async () => {
    const { liftFields } = await loadLifter();
    const result = liftFields('- Verified-at: 1a2cce3\n- Source: incident\n', {});
    assert.deepEqual(fieldMap(result), { 'verified-at': '1a2cce3', source: 'incident' });
    assert.equal(bodyOf(result), '', 'both bullets left the body');
  });

  it('test_when_case_variant_name_then_lifted_lowercased', async () => {
    const { liftFields } = await loadLifter();
    const result = liftFields('- LAST-TOUCHED: 2026-07-20\n', {});
    assert.deepEqual(fieldMap(result), { 'last-touched': '2026-07-20' },
      'name lowercased for the frontmatter key; value untouched');
  });

  it('test_when_prose_bullet_resembling_field_then_body_byte_identical', async () => {
    const { liftFields } = await loadLifter();
    const lines = ['- Path: .claude/hooks/lib/timing.mjs:50', '- Role: orchestrator'];
    const result = liftFields(lines.join('\n') + '\n', {});
    assert.deepEqual(fieldMap(result), {}, 'neither name is on the allowlist');
    assert.equal(bodyOf(result), lines.join('\n'),
      'value with an embedded colon survives byte-identical — the parser must not split on it');
  });

  it('test_when_ambiguous_reader_less_name_then_stays_in_body', async () => {
    const { liftFields } = await loadLifter();
    const lines = ['- Caveat: the dial only reads at spec time', '- Why: two readers disagreed'];
    const result = liftFields(lines.join('\n') + '\n', {});
    assert.deepEqual(fieldMap(result), {},
      'caveat/why appear in frontmatter on 25/13 entries but no consumer reads them — membership is reader-derived, not usage-derived');
    assert.equal(bodyOf(result), lines.join('\n'));
  });

  it('test_when_unknown_name_then_stays_in_body', async () => {
    const { liftFields } = await loadLifter();
    const result = liftFields('- Sparkle: anything at all\n', {});
    assert.deepEqual(fieldMap(result), {});
    assert.equal(bodyOf(result), '- Sparkle: anything at all',
      'the allowlist fails safe toward the body — an unlisted name is never hoisted');
  });

  it('test_when_value_less_verbatim_bullet_then_stays_in_body', async () => {
    const { liftFields } = await loadLifter();
    const result = liftFields('- verbatim:\n', {});
    assert.deepEqual(fieldMap(result), {},
      'verbatim is a blockquote, not a scalar field; the value group must not match an empty value');
    assert.equal(bodyOf(result), '- verbatim:');
  });
});
