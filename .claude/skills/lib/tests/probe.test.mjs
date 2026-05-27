// remove-python-runtime-dep — Covers AC-004 (probe.mjs unit tests for 3 verbs).
//
// probe.mjs replaces the legacy JSON extraction idiom across 8 test fixtures
// (3 hook fixtures + 3 changelog fixtures + 2 parity harnesses). It reads
// JSON from stdin and extracts requested fields.
//
// Contract:
//   echo '<json>' | node probe.mjs field <key>             -> value of obj[key]
//   echo '<json>' | node probe.mjs block <name>            -> obj.hookSpecificOutput.<name>
//   echo '<json>' | node probe.mjs additional-context      -> alias for `block additionalContext`
//
// Exit codes:
//   0 — extracted, printed to stdout (with trailing newline)
//   1 — JSON parse failure OR missing key

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROBE = resolve(here, '..', 'probe.mjs');

function runProbe(stdin, ...args) {
  return spawnSync('node', [PROBE, ...args], {
    input: stdin,
    encoding: 'utf8',
  });
}

describe('probe.mjs', () => {
  it('field <key> extracts a top-level scalar', () => {
    const r = runProbe('{"foo":"bar"}', 'field', 'foo');
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} (${r.stderr})`);
    assert.equal(r.stdout.trim(), 'bar');
  });

  it('field <key> exits 1 when key is missing', () => {
    const r = runProbe('{"foo":"bar"}', 'field', 'baz');
    assert.equal(r.status, 1);
  });

  it('block <name> extracts a hookSpecificOutput.<name> string', () => {
    const r = runProbe(
      '{"hookSpecificOutput":{"additionalContext":"# Block\\nbody"}}',
      'block',
      'additionalContext'
    );
    assert.equal(r.status, 0, `expected exit 0; got ${r.status} (${r.stderr})`);
    assert.equal(r.stdout, '# Block\nbody\n');
  });

  it('additional-context is an alias for block additionalContext', () => {
    const json = '{"hookSpecificOutput":{"additionalContext":"hello"}}';
    const a = runProbe(json, 'additional-context');
    const b = runProbe(json, 'block', 'additionalContext');
    assert.equal(a.status, 0);
    assert.equal(b.status, 0);
    assert.equal(a.stdout, b.stdout);
  });

  it('exits 1 on malformed JSON', () => {
    const r = runProbe('not json at all', 'field', 'foo');
    assert.equal(r.status, 1);
  });

  it('exits 1 on missing block', () => {
    const r = runProbe('{"hookSpecificOutput":{}}', 'block', 'additionalContext');
    assert.equal(r.status, 1);
  });
});
