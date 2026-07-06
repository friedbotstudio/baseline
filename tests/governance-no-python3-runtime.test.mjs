// remove-python-runtime-dep — Covers AC-005, AC-008 (governance pointers updated; seed.md python3 bullet removed).
//
// Governance pointers must not name python3 as a baseline runtime requirement.
// Two flavors of `python3` mention exist in governance:
//   1. Historical narrative — describes the pre-port state ("ported from
//      bash + python3 to .mjs"). These MAY remain.
//   2. Runtime-requirement claims — e.g., "python3 on PATH (skill-only)".
//      After the port, these MUST NOT exist anywhere.
//
// The allow-list is CONTENT-anchored, not line-number-anchored: every
// legitimate historical mention pairs python3 with the port-narrative shape
// ("bash + python3" / "`.sh` + `python3`"). A raw line-number pin broke on
// 2026-07-05 when a seed.md section insertion shifted the pinned line — any
// future insertion would break it again, so the anchor is the phrase itself.
// A runtime-requirement claim ("requires python3", "python3 on PATH") does
// not match the narrative shape and still fails.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');

// Historical port-narrative shapes in which a python3 mention is legitimate:
// "bash + python3" prose and the backticked "`.sh` + `python3`" variant.
const HISTORICAL_NARRATIVE = /(bash|`\.sh`)\s*\+\s*`?python3`?/;

// Per file: whether ANY python3 mention is tolerated. The constitution pair
// must be entirely python3-free; the seed pair may carry narrative mentions.
const GOVERNANCE_FILES = {
  'CLAUDE.md': { narrativeAllowed: false },
  'src/CLAUDE.template.md': { narrativeAllowed: false },
  'docs/init/seed.md': { narrativeAllowed: true },
  'src/seed.template.md': { narrativeAllowed: true },
};

async function scanFile(relPath, { narrativeAllowed }) {
  const text = await readFile(resolve(REPO_ROOT, relPath), 'utf8');
  const lines = text.split('\n');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    // Match the literal binary `python3`, not the language name "Python".
    if (!/\bpython3\b/.test(lines[i])) continue;
    const allowed = narrativeAllowed && HISTORICAL_NARRATIVE.test(lines[i]);
    if (!allowed) {
      violations.push({ line: i + 1, content: lines[i].trim().slice(0, 140) });
    }
  }
  return violations;
}

describe('governance pointers do not name python3 as a runtime requirement', () => {
  for (const [file, policy] of Object.entries(GOVERNANCE_FILES)) {
    it(`${file} mentions python3 only in historical port narrative`, async () => {
      const violations = await scanFile(file, policy);
      if (violations.length > 0) {
        const sample = violations
          .map(v => `  line ${v.line}: ${v.content}`)
          .join('\n');
        assert.fail(`Unexpected python3 mention(s) in ${file}:\n${sample}`);
      }
      assert.equal(violations.length, 0);
    });
  }

  it('a runtime-requirement phrasing would not pass the narrative anchor', () => {
    for (const claim of [
      'requires python3 on PATH (skill-only)',
      'install python3 before running the hooks',
      'python3 .claude/hooks/foo.py',
    ]) {
      assert.equal(HISTORICAL_NARRATIVE.test(claim), false, `must not tolerate: ${claim}`);
    }
    for (const narrative of [
      'faster than the original bash + python3 chain',
      'ported from `.sh` + `python3` to Node ESM',
    ]) {
      assert.equal(HISTORICAL_NARRATIVE.test(narrative), true, `must tolerate: ${narrative}`);
    }
  });
});
