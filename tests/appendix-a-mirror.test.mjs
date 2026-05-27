// remove-python-runtime-dep — Covers AC-012 (CLAUDE.md ↔ src/CLAUDE.template.md Appendix A byte-mirror).
//
// Appendix A in CLAUDE.md (the "Where things live" table) is NOT inside
// Article IV — the existing article-iv-mirror.test.mjs does not catch drift
// between CLAUDE.md and src/CLAUDE.template.md at this row. This safety net
// asserts byte-equality on the row that names the hook scripts.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

function extractAppendixARow(text) {
  // The row this test guards is the `.claude/hooks/` entry in Appendix A's
  // "Where things live" table. The row starts with `| .claude/hooks/ |`.
  // We match the entire pipe-delimited line.
  const m = text.match(/^\|\s*`?\.claude\/hooks\/`?\s*\|.*$/m);
  if (!m) {
    throw new Error('Appendix A `.claude/hooks/` row not found');
  }
  return m[0];
}

describe('Appendix A `.claude/hooks/` row mirrors between CLAUDE.md and src/CLAUDE.template.md', () => {
  it('the rows are byte-equal', async () => {
    const live = await readFile(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const template = await readFile(resolve(REPO_ROOT, 'src/CLAUDE.template.md'), 'utf8');
    const liveRow = extractAppendixARow(live);
    const templateRow = extractAppendixARow(template);
    assert.equal(liveRow, templateRow,
      `Appendix A row drift:\n  CLAUDE.md:        ${liveRow}\n  template:         ${templateRow}`);
  });

  it('the row does not mention python3 (post-port state)', async () => {
    const live = await readFile(resolve(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const row = extractAppendixARow(live);
    assert.equal(
      /\bpython3\b/.test(row), false,
      `Appendix A row still mentions python3: ${row}`
    );
  });
});
