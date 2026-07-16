// C6 — gate taxonomy classifier (docs/specs/gate-taxonomy.md).
// RED until .claude/hooks/lib/gate-taxonomy.mjs exists.
// Covers: AC-001 (closed-set op -> {verdict,category,reason}), AC-002 (unknown/
// missing kind -> ask fail-safe), AC-003 (safe -> category null), AC-004 (all four
// categories reachable via op-kinds), plus purity.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(REPO_ROOT, '.claude/hooks/lib/gate-taxonomy.mjs');

const CATEGORY_IDS = [
  'consent-adjacent-scope',
  'irreversible-destructive',
  'policy-flip',
  'contradictory-requirements',
];

// input -> expected {verdict, category}. Meta flags are caller-supplied (the
// classifier never re-derives them from raw commands).
const CASES = [
  { name: 'git_op_benign_then_safe',                op: { kind: 'git-op', meta: {} },                         verdict: 'safe', category: null },
  { name: 'git_op_destructive_then_ask_irreversible', op: { kind: 'git-op', meta: { destructive: true } },     verdict: 'ask',  category: 'irreversible-destructive' },
  { name: 'git_op_protected_then_ask_consent',      op: { kind: 'git-op', meta: { onProtectedBranch: true } }, verdict: 'ask',  category: 'consent-adjacent-scope' },
  { name: 'destructive_bash_matched_then_ask_irreversible', op: { kind: 'destructive-bash', meta: { matchedPattern: true } }, verdict: 'ask', category: 'irreversible-destructive' },
  { name: 'destructive_bash_benign_then_safe',      op: { kind: 'destructive-bash', meta: {} },                verdict: 'safe', category: null },
  { name: 'consent_token_write_then_ask_consent',   op: { kind: 'consent-token-write' },                      verdict: 'ask',  category: 'consent-adjacent-scope' },
  { name: 'phase_skip_then_ask_consent',            op: { kind: 'phase-skip' },                               verdict: 'ask',  category: 'consent-adjacent-scope' },
  { name: 'spec_widen_then_ask_consent',            op: { kind: 'spec-widen' },                               verdict: 'ask',  category: 'consent-adjacent-scope' },
  { name: 'config_flip_then_ask_policy',            op: { kind: 'config-flip' },                              verdict: 'ask',  category: 'policy-flip' },
  { name: 'requirement_conflict_then_ask_contradictory', op: { kind: 'requirement-conflict' },               verdict: 'ask',  category: 'contradictory-requirements' },
];

describe('C6 CATEGORIES', () => {
  it('test_when_categories_read_then_exactly_the_four_xi12_ids_frozen', async () => {
    const { CATEGORIES } = await import(MOD);
    assert.deepEqual([...CATEGORIES].sort(), [...CATEGORY_IDS].sort());
    assert.ok(Object.isFrozen(CATEGORIES), 'CATEGORIES must be frozen');
  });
});

describe('C6 classifyOperation — closed set (AC-001)', () => {
  for (const c of CASES) {
    it(`test_when_${c.name}`, async () => {
      const { classifyOperation } = await import(MOD);
      const out = classifyOperation(c.op);
      assert.equal(out.verdict, c.verdict, `verdict for ${c.op.kind}`);
      assert.equal(out.category, c.category, `category for ${c.op.kind}`);
      assert.equal(typeof out.reason, 'string');
      assert.ok(out.reason.length > 0, 'reason must be non-empty');
    });
  }
});

describe('C6 classifyOperation — fail-safe (AC-002)', () => {
  it('test_when_unknown_kind_then_ask_fail_safe_naming_kind', async () => {
    const { classifyOperation } = await import(MOD);
    const out = classifyOperation({ kind: 'deploy-to-prod' });
    assert.equal(out.verdict, 'ask');
    assert.equal(out.category, null);
    assert.match(out.reason, /deploy-to-prod/);
  });

  it('test_when_missing_or_empty_descriptor_then_ask_no_throw', async () => {
    const { classifyOperation } = await import(MOD);
    for (const bad of [{}, undefined, null, { kind: '' }]) {
      const out = classifyOperation(bad);
      assert.equal(out.verdict, 'ask', `verdict for ${JSON.stringify(bad)}`);
      assert.equal(out.category, null);
      assert.equal(typeof out.reason, 'string');
    }
  });

  it('test_when_prototype_key_kind_then_ask_no_throw', async () => {
    // Security regression (CWE-1321): a kind colliding with an Object.prototype
    // member must NOT reach an inherited property — it is an unknown kind and must
    // resolve to the fail-safe ask, never a throw or a non-verdict.
    const { classifyOperation } = await import(MOD);
    for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const out = classifyOperation({ kind });
      assert.equal(out.verdict, 'ask', `verdict for kind='${kind}'`);
      assert.equal(out.category, null, `category for kind='${kind}'`);
      assert.match(out.reason, new RegExp(kind === '__proto__' ? '__proto__' : kind));
    }
  });
});

describe('C6 classifyOperation — invariants (AC-003, AC-004)', () => {
  it('test_when_safe_verdict_then_category_null', async () => {
    const { classifyOperation } = await import(MOD);
    for (const c of CASES) {
      const out = classifyOperation(c.op);
      if (out.verdict === 'safe') assert.equal(out.category, null);
    }
  });

  it('test_when_iterate_op_kinds_then_each_category_reachable', async () => {
    const { classifyOperation, CATEGORIES } = await import(MOD);
    const produced = new Set(
      CASES.map((c) => classifyOperation(c.op).category).filter((x) => x !== null),
    );
    for (const cat of CATEGORIES) {
      assert.ok(produced.has(cat), `no op-kind reaches category '${cat}' (dead category)`);
    }
  });

  it('test_when_classify_called_twice_then_identical_and_input_unmutated', async () => {
    const { classifyOperation } = await import(MOD);
    const input = { kind: 'git-op', meta: { destructive: true } };
    const frozenCopy = JSON.stringify(input);
    const a = classifyOperation(input);
    const b = classifyOperation(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(input), frozenCopy, 'input must not be mutated');
  });
});

describe('C6 advisory-only surface (AC-006)', () => {
  it('test_when_module_imported_then_only_advisory_exports_and_no_default', async () => {
    // Covers: AC-006 — the module is advisory-only: it exposes exactly a pure
    // classifier plus two frozen data tables and nothing that mutates a guard or
    // gate, so importing it cannot change any enforcement. The external guard/gate
    // suites passing unchanged is verified by the full suite run at /integrate.
    const mod = await import(MOD);
    assert.deepEqual(
      Object.keys(mod).sort(),
      ['CATEGORIES', 'CONSENT_POINT_MAP', 'classifyOperation'],
    );
    assert.equal(mod.default, undefined, 'no default export / side-effect surface');
  });
});
