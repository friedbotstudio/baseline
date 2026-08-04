// Scenarios for audit awareness of the sharded model — AC-006 (category dirs +
// continuity trails recognized; CC user-memory untouched) and AC-007 (flag off =>
// the existing seven-file store still audits green; additive, non-breaking).
// Covers §Behavior #6 and #7. Fails RED until memory-shape.mjs lands / audit rework.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const MEMORY_SHAPE = pathToFileURL(join(REPO_ROOT, '.claude/skills/audit-baseline/memory-shape.mjs')).href;
const AUDIT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');

// Derived from the registry, never re-listed. This fixture previously hardcoded
// seven names and asserted the count as a literal, so registering an eighth
// category turned a correctly-migrated store into a failure. Deriving both the
// seeded dirs and the expected count from CANONICAL means "a fully migrated store"
// stays true by construction as categories come and go.
import { CANONICAL as CATEGORIES } from '../.claude/skills/memory-index/categories.mjs';

const TRAILS = ['_resume', '_thread', '_pending'];

function seedMigratedStore() {
  const root = mkdtempSync(join(tmpdir(), 'mem-audit-'));
  const mem = join(root, '.claude/memory');
  for (const c of CATEGORIES) {
    mkdirSync(join(mem, c), { recursive: true });
    writeFileSync(join(mem, c, 'one.md'), `---\nkey: one\ncategory: ${c}\nsource: inferred-from-code\nverified-at: abc1234\nlast-touched: 2026-07-17\n---\n\nhook line\n`);
  }
  for (const t of TRAILS) {
    writeFileSync(join(mem, `${t}.md`), `# ${t}\n`);
  }
  writeFileSync(join(mem, 'README.md'), '# Project memory\n');
  return root;
}

describe('audit — sharded store shape (AC-006)', () => {
  it('test_when_audit_on_migrated_store_then_dirs_and_trails_ok', async () => {
    const root = seedMigratedStore();
    try {
      const { checkMemoryShape } = await import(MEMORY_SHAPE);
      const result = checkMemoryShape(join(root, '.claude/memory'));
      assert.equal(result.ok, true, `migrated store should be valid: ${JSON.stringify(result)}`);
      assert.equal(result.categories, CATEGORIES.length, 'every canonical category directory recognized');
      assert.equal(result.trails, 3, 'three continuity trails recognized');
      // AC-006: the check never reaches outside .claude/memory (CC MEMORY.md store).
      assert.ok(!('userMemory' in result), 'the CC session-level MEMORY.md store is not read');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('audit — flag off is non-breaking (AC-007)', () => {
  it('test_when_flag_off_then_audit_exit0_seven_files', () => {
    // The live repo has memory.sharded_store.enabled absent (default off) and the
    // classic seven flat files. The redesign is additive: the audit must still pass.
    const r = spawnSync('node', [AUDIT], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `audit-baseline must stay green with the flag off:\n${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stdout || '', /FAIL/, 'no FAIL rows on the unchanged seven-file store');
  });
});
