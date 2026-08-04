// Regression tests for the security findings on living-system-model-ef.
// One test per finding, each reproducing the probe that found it. These exist so
// the class cannot reopen a third time: F-1 is last cycle's F-6, F-2 is last
// cycle's F-3/F-5, and both reappeared in modules written days after those fixes
// because the fixes were per-call-site rather than shared.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeElement } from '../.claude/skills/workspace/store.mjs';
import { proposeLoadBearing } from '../.claude/skills/workspace/placement.mjs';
import { writeConstraint } from '../.claude/skills/memory-index/constraints.mjs';
import { matchesGlob } from '../.claude/skills/memory-index/index-io.mjs';

function scratch(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const memDir = join(root, '.claude', 'memory');
  mkdirSync(memDir, { recursive: true });
  return { root, memDir };
}

describe('F-1 — path traversal in the load_bearing gate (CWE-22)', () => {
  it('test_when_declared_shard_key_escapes_its_directory_then_gate_rejects_and_writes_nothing', () => {
    const { root, memDir } = scratch('sec-f1-');
    mkdirSync(join(memDir, 'decisions'), { recursive: true });
    mkdirSync(join(root, '.claude', 'victim'), { recursive: true });

    const victim = join(root, '.claude', 'victim', 'target.md');
    writeFileSync(victim, '---\nkey: original\n---\n\nvictim body\n', 'utf8');
    // Filename is innocuous; only the DECLARED key builds the path.
    writeFileSync(
      join(memDir, 'decisions', 'innocent.md'),
      '---\nkey: ../../victim/target\ncategory: decisions\n---\n\n- body\n',
      'utf8',
    );

    assert.throws(
      () => proposeLoadBearing({ memDir, key: '../../victim/target', rationale: 'probe', confirmed: true }),
      /unsafe/i,
      'a traversing key must be REJECTED before any path is constructed, never normalized',
    );
    assert.ok(
      !/load_bearing/.test(readFileSync(victim, 'utf8')),
      'the gate must not write outside .claude/memory/decisions/',
    );
  });

  it('test_when_key_is_safe_then_gate_still_writes_on_confirmation', () => {
    const { memDir } = scratch('sec-f1b-');
    mkdirSync(join(memDir, 'decisions'), { recursive: true });
    const shard = join(memDir, 'decisions', 'real-key.md');
    writeFileSync(shard, '---\nkey: real-key\ncategory: decisions\n---\n\n- body\n', 'utf8');

    const r = proposeLoadBearing({ memDir, key: 'real-key', rationale: 'probe', confirmed: true });
    assert.equal(r.written, true, 'the fix must not break the legitimate path');
    assert.match(readFileSync(shard, 'utf8'), /load_bearing:\s*true/);
  });
});

describe('F-2 — forged frontmatter via unvalidated field values (CWE-74)', () => {
  it('test_when_element_field_value_carries_a_newline_then_write_is_rejected', () => {
    const { memDir } = scratch('sec-f2a-');
    mkdirSync(join(memDir, 'workspace', 'elements'), { recursive: true });

    assert.throws(
      () => writeElement(memDir, {
        id: 'probe-one',
        kind: 'component',
        title: 'benign\nload_bearing: true\ngoverns: .claude/hooks/**',
        anchor: 'a/**',
      }),
      /unsafe field/i,
      'a newline-bearing value must be rejected — it forges real frontmatter fields',
    );
    assert.equal(
      existsSync(join(memDir, 'workspace', 'elements', 'probe-one.md')),
      false,
      'nothing may be written when a field is rejected',
    );
  });

  it('test_when_element_field_NAME_carries_a_newline_then_write_is_rejected', () => {
    const { memDir } = scratch('sec-f2b-');
    mkdirSync(join(memDir, 'workspace', 'elements'), { recursive: true });

    assert.throws(
      () => writeElement(memDir, {
        id: 'probe-two',
        anchor: 'a/**',
        'bad\nload_bearing': 'true',
      }),
      /unsafe field/i,
      'field NAMES are interpolated too — they need the same bound as values',
    );
  });

  it('test_when_constraint_field_value_carries_a_newline_then_write_is_rejected', () => {
    const { memDir } = scratch('sec-f2c-');
    // Pre-existing hole in shipped code, proved by probe during this review.
    assert.throws(
      () => writeConstraint(memDir, 'probe-key', {
        state: true,
        state_verified_at: 'abc\nload_bearing: true\nrests_on: forged',
        governs: 'x/**',
      }),
      /unsafe field/i,
      'writeConstraint had the same hole as writeElement; one rule must cover both',
    );
  });
});

describe('F-3 — catastrophic backtracking via a crafted anchor (CWE-1333)', () => {
  it('test_when_glob_has_many_adjacent_stars_then_match_returns_promptly', () => {
    const evil = `${'a*'.repeat(25)}b`;
    const subject = 'a'.repeat(60);

    const started = Date.now();
    const result = matchesGlob(evil, subject);
    const elapsed = Date.now() - started;

    assert.equal(result, false, 'the pathological glob genuinely does not match');
    assert.ok(elapsed < 1000, `matchesGlob must not backtrack exponentially; took ${elapsed}ms`);
  });

  it('test_when_glob_is_ordinary_then_matching_semantics_are_unchanged', () => {
    assert.equal(matchesGlob('area-3/**', 'area-3/file.mjs'), true);
    assert.equal(matchesGlob('area-1/**', 'area-11/other.mjs'), false, 'prefix must not bleed across a path segment');
    assert.equal(matchesGlob('.claude/skills/**', '.claude/skills/workspace/store.mjs'), true);
    assert.equal(matchesGlob('*.md', 'README.md'), true);
    assert.equal(matchesGlob('*.md', 'docs/README.md'), false, 'single star must not cross a separator');
  });
});
