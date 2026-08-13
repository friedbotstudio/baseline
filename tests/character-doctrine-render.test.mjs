// Foundation contract for the character doctrine: load, render, extract, stamp.
//
// The render rule has exactly one home (spec S-3). These tests pin it there, so a
// second copy inside the stamper or the audit check fails here before it can drift.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const MODULE = '.claude/skills/audit-baseline/character.mjs';
const TARGETS = [
  'brainstorm', 'intake', 'spec', 'spec-shippability-review', 'spec-traceability-review',
  'spec-diagram-review', 'spec-rollout-enforceability-review', 'scenario', 'implement',
  'code-structure', 'tdd', 'simplify', 'integrate', 'security',
];

const ENTRY = { soul: 'The witness.', motivation: 'Four phases read this.', mantra: 'I name the non-goal now.' };
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
  it('test_when_entry_complete_then_render_emits_heading_and_three_bullets', () => {
    // Covers AC-005.
    const block = mod.renderBlock(ENTRY);
    assert.match(block, /^<!-- character:begin -->/);
    assert.match(block, /<!-- character:end -->\n$/);
    assert.match(block, /^## Character$/m);
    for (const part of ['Soul', 'Motivation', 'Mantra']) {
      assert.equal((block.match(new RegExp(`^- \\*\\*${part}\\.\\*\\*`, 'gm')) || []).length, 1);
    }
  });

  it('test_when_entry_part_blank_then_render_throws_naming_the_part', () => {
    // Covers AC-003.
    for (const part of ['soul', 'motivation', 'mantra']) {
      for (const bad of ['', '   ', undefined]) {
        assert.throws(
          () => mod.renderBlock({ ...ENTRY, [part]: bad }),
          new RegExp(part, 'i'),
          `renderBlock must name "${part}" when it is ${JSON.stringify(bad)} — AC-003 requires the audit to report which part is missing`,
        );
      }
    }
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
    // Covers AC-025.
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
