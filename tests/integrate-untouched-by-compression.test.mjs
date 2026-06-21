// AC-005 — integrate's serial-run path is untouched by artifact compression.
//
// AC-005 is a negative invariant ("integrate's serialization is byte-for-byte
// unchanged"). Rather than a brittle hash-vs-HEAD compare that would trip on any
// future legitimate integrate edit, this asserts the DURABLE intent: the
// compression feature must not couple into integrate. integrate keeps owning its
// serial full-suite run + four-line last_test_result, and references none of the
// compression machinery. SUT: .claude/skills/integrate/SKILL.md.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTEGRATE = path.join(HERE, '../.claude/skills/integrate/SKILL.md');

const COMPRESSION_TOKENS = [
  'resolveProfile',
  'write-set-profile',
  'diagram_profiles',
  'artifacts.compression',
  'compression.enabled',
];

describe('AC-005 — integrate untouched by artifact compression', () => {
  it('test_when_integrate_skill_read_then_no_compression_coupling', async () => {
    const text = await readFile(INTEGRATE, 'utf8');
    for (const token of COMPRESSION_TOKENS) {
      assert.ok(!text.includes(token),
        `integrate must not reference compression machinery, found: ${token}`);
    }
  });

  it('test_when_integrate_skill_read_then_serial_run_path_intact', async () => {
    const text = await readFile(INTEGRATE, 'utf8');
    assert.match(text, /last_test_result/, 'integrate still owns the four-line verdict stamp');
    assert.match(text, /full suite/i, 'integrate still runs the full suite serially');
  });
});
