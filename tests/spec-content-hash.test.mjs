// spec-content-hash — Foundation layer (pure, node:crypto only).
//
// T1 of harden-power-track-debt: gate A binds a spec CONTENT hash, not just the
// git SHA (which is N/A for untracked first-time specs). This exercises the new
// helper .claude/hooks/lib/spec-content-hash.mjs (hand-written shipped source,
// beside common.mjs / consent-decision.mjs — NOT a src/cli mirror).
//
// RED until /implement creates computeSpecContentHash + compareSpecHash.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let mod;
try {
  mod = await import(path.join(REPO_ROOT, '.claude/hooks/lib/spec-content-hash.mjs'));
} catch (err) {
  throw new Error(
    `Cannot import .claude/hooks/lib/spec-content-hash.mjs (RED expected pre-/implement). ` +
    `Original: ${err.message}`
  );
}

function fn(name) {
  assert.equal(typeof mod[name], 'function', `expected named export \`${name}\` to be a function`);
  return mod[name];
}

describe('computeSpecContentHash', () => {
  // AC-001
  it('test_when_computeSpecContentHash_called_then_returns_stable_sha256_hex', () => {
    const h = fn('computeSpecContentHash');
    const a = h('some spec bytes');
    const b = h('some spec bytes');
    assert.match(a, /^[0-9a-f]{64}$/, 'sha256 hex is 64 lowercase hex chars');
    assert.equal(a, b, 'stable across calls');
  });

  // AC-001
  it('test_when_input_empty_unicode_or_buffer_then_stable_hex_no_throw', () => {
    const h = fn('computeSpecContentHash');
    for (const input of ['', 'héllo — 世界 🌍', Buffer.from('bytes')]) {
      const out = h(input);
      assert.match(out, /^[0-9a-f]{64}$/, `stable hex for ${JSON.stringify(String(input))}`);
    }
    assert.notEqual(h('a'), h('b'), 'different inputs -> different hashes');
    assert.equal(h('x'), h(Buffer.from('x')), 'string and equivalent buffer hash the same');
  });

  // AC-001
  it('test_when_input_not_string_or_buffer_then_throws', () => {
    const h = fn('computeSpecContentHash');
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.throws(() => h(bad), `must throw on ${JSON.stringify(bad)}`);
    }
  });
});

describe('compareSpecHash — the resume check', () => {
  // AC-003
  it('test_when_token_hash_matches_live_spec_then_helper_reports_match', () => {
    const h = fn('computeSpecContentHash');
    const cmp = fn('compareSpecHash');
    const bytes = 'the approved spec bytes';
    assert.equal(cmp(h(bytes), bytes), true, 'matching hash -> proceed');
  });

  // AC-002
  it('test_when_token_hash_differs_from_live_spec_then_helper_reports_mismatch', () => {
    const h = fn('computeSpecContentHash');
    const cmp = fn('compareSpecHash');
    const staleHash = h('the spec as approved');
    assert.equal(cmp(staleHash, 'the spec AFTER a post-approval amendment'), false, 'stale hash -> re-yield');
  });

  // AC-002 — a missing/blank token hash must not silently pass (fail-safe re-yield)
  it('test_when_token_hash_absent_then_helper_reports_mismatch', () => {
    const cmp = fn('compareSpecHash');
    for (const absent of ['', null, undefined, 'N/A']) {
      assert.equal(cmp(absent, 'any bytes'), false, `absent token hash ${JSON.stringify(absent)} -> re-yield`);
    }
  });
});
