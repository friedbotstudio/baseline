// Foundation contract for the character doctrine: load, render, extract, stamp.
//
// The render rule has exactly one home (spec S-3). These tests pin it there, so a
// second copy inside the stamper or the audit check fails here before it can drift.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const MODULE = '.claude/skills/audit-baseline/character.mjs';
const CHECK_REL = '.claude/skills/audit-baseline/checks/skill-character.mjs';
const TARGETS = [
  'brainstorm', 'intake', 'spec', 'spec-shippability-review', 'spec-traceability-review',
  'spec-diagram-review', 'spec-rollout-enforceability-review', 'scenario', 'implement',
  'code-structure', 'tdd', 'simplify', 'integrate', 'security',
];

// Order is the render contract, not a formatting preference: the audit compares bytes,
// so a reordered PARTS would report every one of the fourteen as drifted.
const PART_LABELS = ['Soul', 'Motivation', 'Mantra', 'Temperament', 'Voice', 'Resolve'];
const PART_KEYS = ['soul', 'motivation', 'mantra', 'temperament', 'voice', 'resolve'];

const ENTRY = {
  soul: 'The witness.',
  motivation: 'Four phases read this.',
  mantra: 'I name the non-goal now.',
  temperament: 'Literal-minded on purpose, and unhurried about it.',
  voice: 'Quotes first, comments second.',
  resolve: 'If I do not write it down, it did not happen.',
};
const FRONTMATTER = ['---', 'name: demo', 'owner: baseline', '---', '', '# Demo', '', 'Body line.'].join('\n');

let mod;
before(async () => {
  mod = await tryImport(MODULE);
  assert.ok(mod, `${MODULE} must exist and import cleanly — it is the single render rule every other unit composes`);
});

function tmpRoot() {
  const root = mkdtempSync(join(tmpdir(), 'character-'));
  mkdirSync(join(root, '.claude', 'skills', 'audit-baseline'), { recursive: true });
  return root;
}

function writeDoctrine(root, body) {
  writeFileSync(join(root, '.claude', 'skills', 'audit-baseline', 'character.json'), body);
}

describe('character doctrine — load', () => {
  it('test_when_doctrine_valid_then_load_returns_fourteen_entries', () => {
    // Covers AC-001.
    const doctrine = mod.loadDoctrine(REPO_ROOT);
    assert.deepEqual(Object.keys(doctrine.skills).sort(), [...TARGETS].sort());
  });

  it('test_when_doctrine_file_absent_then_load_throws', () => {
    // Covers AC-001.
    const root = tmpRoot();
    try {
      assert.throws(() => mod.loadDoctrine(root), /character\.json/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('test_when_doctrine_json_malformed_then_load_throws', () => {
    // Covers AC-001.
    const root = tmpRoot();
    writeDoctrine(root, '{ "skills": { "spec": ');
    try {
      assert.throws(() => mod.loadDoctrine(root));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('character doctrine — render', () => {
  it('test_when_entry_complete_then_render_emits_heading_and_six_bullets', () => {
    // Covers AC-001.
    const block = mod.renderBlock(ENTRY);
    assert.match(block, /^<!-- character:begin -->/);
    assert.match(block, /<!-- character:end -->\n$/);
    assert.match(block, /^## Character$/m);
    for (const part of PART_LABELS) {
      assert.equal((block.match(new RegExp(`^- \\*\\*${part}\\.\\*\\*`, 'gm')) || []).length, 1);
    }
    assert.equal(
      (block.match(/^- \*\*\w+\.\*\*/gm) || []).length, PART_LABELS.length,
      'six bullets and no seventh — an extra bullet means PARTS and the doctrine disagree',
    );
  });

  it('test_when_entry_rendered_then_bullet_order_is_canonical', () => {
    // Covers AC-001.
    const block = mod.renderBlock(ENTRY);
    const positions = PART_LABELS.map((label) => block.indexOf(`- **${label}.**`));
    assert.ok(positions.every((at) => at !== -1), 'every label must be present before order can be judged');
    assert.deepEqual(
      [...positions].sort((a, b) => a - b), positions,
      'the audit compares rendered bytes, so reordering PARTS would report all fourteen skills as drifted',
    );
  });

  it('test_when_entry_part_blank_then_render_throws_naming_the_part', () => {
    // Covers AC-002.
    for (const part of PART_KEYS) {
      for (const bad of ['', '   ', undefined]) {
        assert.throws(
          () => mod.renderBlock({ ...ENTRY, [part]: bad }),
          new RegExp(part, 'i'),
          `renderBlock must name "${part}" when it is ${JSON.stringify(bad)} — the audit reports which part is missing, and it can only do that if the throw carries the key`,
        );
      }
    }
  });

  it('test_when_entry_carries_unknown_key_then_render_ignores_it', () => {
    // Covers AC-001 (boundary).
    const block = mod.renderBlock({ ...ENTRY, vice: 'Obsessive about margins.' });
    assert.equal(block, mod.renderBlock(ENTRY), 'PARTS decides what is emitted, never the entry');
    assert.ok(!block.includes('Obsessive about margins.'));
  });

  it('test_when_six_field_block_rendered_then_first_three_bullets_match_legacy_bytes', () => {
    // Covers AC-001 (regression). The three new fields append; they never reshape what
    // was already stamped, so the first three lines of all fourteen blocks are untouched.
    const lines = mod.renderBlock(ENTRY).split('\n');
    const bullets = lines.filter((line) => line.startsWith('- **'));
    assert.deepEqual(bullets.slice(0, 3), [
      `- **Soul.** ${ENTRY.soul}`,
      `- **Motivation.** ${ENTRY.motivation}`,
      `- **Mantra.** ${ENTRY.mantra}`,
    ]);
  });
});

describe('character doctrine — the render rule has one home', () => {
  it('test_when_parts_exported_then_it_carries_six_ordered_pairs', () => {
    // Covers AC-006.
    assert.ok(Array.isArray(mod.PARTS), 'PARTS must be exported so its one consumer can import it');
    assert.deepEqual(mod.PARTS.map(([key]) => key), PART_KEYS);
    assert.deepEqual(mod.PARTS.map(([, label]) => label), PART_LABELS);
  });

  it('test_when_check_source_read_then_parts_is_imported_not_redeclared', () => {
    // Covers AC-006.
    //
    // character.mjs's own header states the rule: a second copy of it drifts, and the
    // drift check then compares two wrongs. The audit check WAS that second copy.
    const source = readFileSync(join(REPO_ROOT, CHECK_REL), 'utf8');
    assert.doesNotMatch(
      source, /^\s*const PARTS\s*=/m,
      'checks/skill-character.mjs must not declare its own PARTS — expanding one copy and not the other is exactly the drift the header warns about',
    );
    assert.match(
      source, /import\s*\{[^}]*\bPARTS\b[^}]*\}\s*from\s*'\.\.\/character\.mjs'/,
      'it must import PARTS from the module that owns the render rule',
    );
  });
});

describe('character doctrine — extract and stamp', () => {
  it('test_when_skill_md_has_block_then_extract_returns_span', () => {
    // Covers AC-004.
    const stamped = mod.stampSkill(FRONTMATTER, mod.renderBlock(ENTRY));
    const span = mod.extractBlock(stamped);
    assert.ok(span, 'extractBlock must find a block the stamper just wrote');
    assert.equal(span.text, mod.renderBlock(ENTRY));
    assert.ok(span.endLine >= span.startLine);
  });

  it('test_when_skill_md_lacks_block_then_extract_returns_null', () => {
    // Covers AC-002.
    assert.equal(mod.extractBlock(FRONTMATTER), null);
  });

  it('test_when_no_block_present_then_stamp_inserts_after_frontmatter', () => {
    // Covers AC-005.
    const stamped = mod.stampSkill(FRONTMATTER, mod.renderBlock(ENTRY));
    const lines = stamped.split('\n');
    const closingFence = lines.indexOf('---', 1);
    assert.equal(
      lines[closingFence + 1], '',
      'S-2 puts the block immediately after the frontmatter fence — the only anchor all fourteen targets share',
    );
    assert.equal(lines[closingFence + 2], '<!-- character:begin -->');
    assert.ok(stamped.includes('# Demo'), 'the original body must survive stamping');
  });

  it('test_when_block_present_then_stamp_replaces_the_span', () => {
    // Covers AC-005.
    const once = mod.stampSkill(FRONTMATTER, mod.renderBlock(ENTRY));
    const revised = mod.renderBlock({ ...ENTRY, mantra: 'A different mantra.' });
    const twice = mod.stampSkill(once, revised);
    assert.equal((twice.match(/<!-- character:begin -->/g) || []).length, 1);
    assert.ok(twice.includes('A different mantra.'));
    assert.ok(!twice.includes(ENTRY.mantra));
    assert.ok(twice.includes('# Demo'));
  });

  it('test_when_stamped_twice_then_bytes_unchanged', () => {
    // Covers AC-025, AC-007 — idempotency is what lets Stage 0c run on every build.
    const block = mod.renderBlock(ENTRY);
    const once = mod.stampSkill(FRONTMATTER, block);
    assert.equal(mod.stampSkill(once, block), once);
  });

  it('test_when_no_frontmatter_fence_then_stamp_throws_naming_the_file', () => {
    // Covers AC-005.
    assert.throws(
      () => mod.stampSkill('# No frontmatter here\n', mod.renderBlock(ENTRY)),
      /frontmatter/i,
      'a target with no fence has no insertion point; stampSkill must refuse rather than guess one',
    );
  });
});
