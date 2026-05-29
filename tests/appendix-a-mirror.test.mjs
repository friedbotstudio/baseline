// remove-python-runtime-dep — Covers AC-012 (Appendix A `.claude/hooks/` row hygiene).
//
// Appendix A (the "Where things live" table) was relocated out of CLAUDE.md
// into `.claude/CONSTITUTION.md` (the annex) when CLAUDE.md was capped at
// 40,000 chars — see CLAUDE.md Article I.6 / seed.md §14. The annex is the
// single source for this table (CLAUDE.md no longer carries it and has no
// per-row template mirror), so this safety net now asserts the `.claude/hooks/`
// row lives in the annex and stays free of the pre-port `python3` reference.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const ANNEX = resolve(REPO_ROOT, '.claude/CONSTITUTION.md');

function extractAppendixARow(text) {
  // The row this test guards is the `.claude/hooks/` entry in Appendix A's
  // "Where things live" table. The row starts with `| .claude/hooks/ |`.
  // We match the entire pipe-delimited line.
  const m = text.match(/^\|\s*`?\.claude\/hooks\/`?\s*\|.*$/m);
  if (!m) {
    throw new Error('Appendix A `.claude/hooks/` row not found in .claude/CONSTITUTION.md');
  }
  return m[0];
}

describe('Appendix A `.claude/hooks/` row lives in the annex (.claude/CONSTITUTION.md)', () => {
  it('the `.claude/hooks/` row is present in the annex', async () => {
    const annex = await readFile(ANNEX, 'utf8');
    const row = extractAppendixARow(annex);
    assert.match(row, /hook scripts/, `Appendix A hooks row malformed: ${row}`);
  });

  it('the row does not mention python3 (post-port state)', async () => {
    const annex = await readFile(ANNEX, 'utf8');
    const row = extractAppendixARow(annex);
    assert.equal(
      /\bpython3\b/.test(row), false,
      `Appendix A row still mentions python3: ${row}`
    );
  });

  it('CLAUDE.md no longer carries Appendix A (it points to the annex)', async () => {
    const live = await readFile(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    assert.equal(
      /^##\s+Appendix A\b/m.test(live), false,
      'CLAUDE.md still contains an "Appendix A" heading — it should reference the annex instead'
    );
  });
});
