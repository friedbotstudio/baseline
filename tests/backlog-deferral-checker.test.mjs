// The deferral checker: an assistant deferral must name its reason.
//
// Enforce-on-touch is not implemented anywhere in the checker — it falls out of
// changedFiles being the only input. The absent-entry case below is what proves it.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { tryImport } from './helpers/memory-fixtures.mjs';

const MODULE = '.claude/skills/harness/checkers/backlog-deferral.mjs';
const REASONS = ['dependency', 'risk', 'cost', 'human-directed'];

// Written as escapes, never as literal bytes: a raw ESC in source survives an editor
// round-trip badly and makes the file read as binary to grep.
const ESC = '\u001b';
const BEL = '\u0007';
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

let mod;
before(async () => {
  mod = await tryImport(MODULE);
  assert.ok(mod, `${MODULE} must exist — it is the enforcement point for AC-009 through AC-012`);
});

function entry(key, fields) {
  const lines = ['---', `key: ${key}`, 'category: backlog', 'status: open'];
  for (const [name, value] of Object.entries(fields)) lines.push(`${name}: ${value}`);
  lines.push('---', '', '> Some deferred follow-up.', '');
  return { path: `.claude/memory/backlog/${key}.md`, content: lines.join('\n') };
}

function findingsFor(changedFiles) {
  return mod.run({ changedFiles }).findings;
}

describe('backlog deferral checker', () => {
  it('test_when_changed_entry_untagged_then_checker_blocks_naming_key', () => {
    // Covers AC-009.
    const found = findingsFor([entry('untagged-thing-1a2b', { source: 'assistant-deferral' })]);
    assert.equal(found.length, 1);
    assert.match(found[0].evidence ?? found[0].message, /untagged-thing-1a2b/);
    assert.equal(found[0].severity, 'BLOCKER', 'AC-009 makes an untagged assistant deferral a BLOCKER, not a note');
  });

  it('test_when_changed_entry_tagged_valid_then_checker_emits_no_finding', () => {
    // Covers AC-010.
    for (const reason of REASONS) {
      const found = findingsFor([entry(`tagged-${reason}-9f9f`, { source: 'assistant-deferral', deferred: reason })]);
      assert.deepEqual(found, [], `"${reason}" is on the closed list and must pass clean`);
    }
  });

  it('test_when_changed_entry_tag_invalid_then_checker_blocks_naming_value', () => {
    // Covers AC-011.
    for (const bad of ['YAGNI', 'later', 'nice-to-have']) {
      const found = findingsFor([entry('bad-tag-3c3c', { source: 'assistant-deferral', deferred: bad })]);
      assert.equal(found.length, 1, `"${bad}" is outside the closed list`);
      const text = `${found[0].evidence ?? ''} ${found[0].message ?? ''}`;
      assert.match(text, /bad-tag-3c3c/);
      assert.match(text, new RegExp(bad));
      assert.equal(found[0].severity, 'BLOCKER');
    }
  });

  it('test_when_entry_absent_from_changed_files_then_checker_emits_no_finding', () => {
    // Covers AC-012.
    const untouched = entry('pre-existing-untagged-7d7d', { source: 'assistant-deferral' });
    const changed = entry('something-else-4e4e', { source: 'assistant-deferral', deferred: 'cost' });
    const found = findingsFor([changed]);
    assert.deepEqual(
      found, [],
      `${untouched.path} is untagged but not in changedFiles — enforce-on-touch means it is never read`,
    );
  });

  it('test_when_frontmatter_unparseable_then_checker_emits_one_finding_without_throwing', () => {
    // Covers AC-009.
    const broken = { path: '.claude/memory/backlog/broken-5f5f.md', content: '---\nkey: broken-5f5f\nsource: assistant-deferral\n' };
    const found = findingsFor([broken]);
    assert.equal(found.length, 1);
  });

  it('test_when_entry_carries_control_characters_then_finding_text_is_neutralised', () => {
    // Covers AC-027.
    const evil = [
      '---',
      `key: innocent${ESC}[2K${ESC}[1Gskill character: ALL PASS`,
      'source: assistant-deferral',
      `deferred: ${ESC}[31mBOGUS${BEL}`,
      '---',
      '',
    ].join('\n');
    const found = findingsFor([{ path: '.claude/memory/backlog/evil-8b8b.md', content: evil }]);
    assert.equal(found.length, 1);
    for (const field of ['evidence', 'message', 'suggested_fix']) {
      const text = String(found[0][field] ?? '');
      assert.ok(
        !CONTROL_CHARS.test(text),
        `${field} still carries a control character — ESC [2K [1G erases the terminal line above and forges a passing row`,
      );
    }
    assert.ok(
      !CONTROL_CHARS.test(String(found[0].artifact?.locus ?? '')),
      'artifact.locus is rendered too, so it needs the same neutralisation',
    );
  });

  it('test_when_entry_key_is_absurdly_long_then_finding_text_is_clipped', () => {
    // Covers AC-027.
    const key = 'k'.repeat(4000);
    const content = ['---', `key: ${key}`, 'source: assistant-deferral', '---', ''].join('\n');
    const found = findingsFor([{ path: '.claude/memory/backlog/long-9c9c.md', content }]);
    assert.equal(found.length, 1);
    assert.ok(String(found[0].evidence).length < 300, 'a 4000-character key must not become a 4000-character report line');
  });

  it('test_when_changed_files_empty_then_checker_returns_no_findings', () => {
    // Covers AC-012.
    for (const input of [[], undefined]) {
      assert.deepEqual(mod.run({ changedFiles: input }).findings, []);
    }
  });

  it('test_when_source_not_assistant_deferral_then_checker_skips', () => {
    // Covers AC-010.
    for (const source of ['user-instruction', 'user-feedback', 'incident', 'inferred-from-code']) {
      const found = findingsFor([entry(`other-source-6a6a`, { source })]);
      assert.deepEqual(found, [], `only assistant-deferral entries carry the reason requirement, not "${source}"`);
    }
  });
});
