// The doctrine's genesis record, and the boundary it deliberately does not cross.
//
// seed.md §19 documents what character.json/character.mjs/checks/stamp-character do and
// states the meta-rule an author is bound by. CLAUDE.md stays out of it: the rule binds
// whoever writes a doctrine entry, not Claude executing a phase, so it earns no warm
// context (spec character-block-six-fields D-6).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const SEED = 'docs/init/seed.md';
const SEED_MIRROR = 'src/seed.template.md';
const CONSTITUTION = 'CLAUDE.md';
const CONSTITUTION_MIRROR = 'src/CLAUDE.template.md';
const CAP = 40000;
const FIELDS = ['soul', 'motivation', 'mantra', 'temperament', 'voice', 'resolve'];

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function sectionNineteen(text) {
  const start = text.indexOf('## §19');
  assert.notEqual(start, -1, `${SEED} must carry a §19 section — the doctrine has no genesis record without it`);
  const next = text.indexOf('\n## ', start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

describe('character doctrine — seed.md §19 records what ships', () => {
  it('test_when_seed_read_then_section_19_names_doctrine_paths_and_six_fields', () => {
    // Covers AC-009.
    const section = sectionNineteen(read(SEED));
    for (const path of [
      '.claude/skills/audit-baseline/character.json',
      '.claude/skills/audit-baseline/character.mjs',
      '.claude/skills/audit-baseline/checks/skill-character.mjs',
      'scripts/stamp-character.mjs',
    ]) {
      assert.ok(section.includes(path), `§19 must name ${path} — a reader cannot find the doctrine otherwise`);
    }
    for (const field of FIELDS) {
      assert.match(section, new RegExp(`\`${field}\``), `§19 must name the ${field} field`);
    }
  });

  it('test_when_seed_read_then_section_19_states_the_meta_rule', () => {
    // Covers AC-010.
    const section = sectionNineteen(read(SEED));
    assert.match(
      section,
      /SHALL NOT introduce, remove, reorder, or override an SOP requirement/,
      'the meta-rule is the whole point of the section — without it §19 is a file listing',
    );
    assert.match(section, /distinctiveness test/i, '§19 must carry the interchangeability check');
  });

  it('test_when_seed_mirror_read_then_section_19_is_present_too', () => {
    // Covers AC-009. The mirror is byte-equal from §17 onward; a §19 that lands in one
    // and not the other is exactly the drift sync-constitution-mirror exists to prevent.
    assert.ok(read(SEED_MIRROR).includes('## §19'), `${SEED_MIRROR} must mirror the §19 section`);
  });
});

describe('character doctrine — the constitution is deliberately untouched', () => {
  it('test_when_constitution_read_then_character_rule_is_absent_and_mirror_is_byte_equal', () => {
    // Covers AC-011.
    const live = read(CONSTITUTION);
    const mirror = read(CONSTITUTION_MIRROR);
    assert.equal(live, mirror, 'Article XII.4 requires the byte-equal mirror');
    assert.ok(live.length <= CAP, `CLAUDE.md is ${live.length} chars, over the ${CAP} cap`);
    for (const field of ['temperament', 'voice', 'resolve']) {
      assert.doesNotMatch(
        live, new RegExp(`\`${field}\``),
        `CLAUDE.md must not carry the ${field} field — D-6 keeps the doctrine in seed.md, off the warm-context budget`,
      );
    }
  });
});

describe('character doctrine — the shipped doctrine is complete', () => {
  it('test_when_doctrine_loaded_then_every_entry_carries_six_fields', async () => {
    // Covers AC-003. renderBlock throws on a missing field, so an under-filled entry
    // fails the whole audit rather than shipping a half character (D-2).
    const mod = await tryImport('.claude/skills/audit-baseline/character.mjs');
    assert.ok(mod, 'character.mjs must import cleanly');
    const entries = Object.entries(mod.loadDoctrine(REPO_ROOT).skills);
    assert.equal(entries.length, 15, 'the doctrine covers fifteen skills');
    for (const [slug, entry] of entries) {
      for (const field of FIELDS) {
        assert.equal(typeof entry[field], 'string', `${slug}.${field} must be a string`);
        assert.notEqual(entry[field].trim(), '', `${slug}.${field} must not be blank`);
      }
    }
  });
});
