// remove-python-runtime-dep — Covers AC-005, AC-008 (governance pointers updated; seed.md python3 bullet removed).
//
// Governance pointers must not name python3 as a baseline runtime requirement.
// Two flavors of `python3` mention exist in governance:
//   1. Historical narrative — describes the pre-port state ("ported from
//      bash + python3 to .mjs"). These MAY remain; they live at known lines.
//   2. Runtime-requirement claims — e.g., "python3 on PATH (skill-only)".
//      After the port, these MUST NOT exist anywhere.
//
// This test enumerates the four governance files and forbids python3
// mentions OUTSIDE the explicit historical-narrative line allow-list.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

// Per file, the line numbers where python3 mentions are LEGITIMATE historical
// narrative. Any python3 mention OUTSIDE these lines is a port miss.
//
// The line numbers correspond to the post-port state. Implementers updating
// the governance files must adjust this map together with their edits.
const ALLOWED_LINES = {
  'CLAUDE.md': new Set([]),
  'src/CLAUDE.template.md': new Set([]),
  'docs/init/seed.md': new Set([14, 169, 637]),
  'src/seed.template.md': new Set([14, 169]),
};

async function scanFile(relPath) {
  const text = await readFile(resolve(REPO_ROOT, relPath), 'utf8');
  const lines = text.split('\n');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    // Match the literal binary `python3`, not the language name "Python".
    if (/\bpython3\b/.test(lines[i])) {
      const allowed = ALLOWED_LINES[relPath]?.has(lineNo);
      if (!allowed) {
        violations.push({ line: lineNo, content: lines[i].trim().slice(0, 140) });
      }
    }
  }
  return violations;
}

describe('governance pointers do not name python3 as a runtime requirement', () => {
  for (const file of Object.keys(ALLOWED_LINES)) {
    it(`${file} mentions python3 only at allow-listed historical lines`, async () => {
      const violations = await scanFile(file);
      if (violations.length > 0) {
        const sample = violations
          .map(v => `  line ${v.line}: ${v.content}`)
          .join('\n');
        assert.fail(`Unexpected python3 mention(s) in ${file}:\n${sample}`);
      }
      assert.equal(violations.length, 0);
    });
  }
});
