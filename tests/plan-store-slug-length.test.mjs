// Slice T1 — plan-store slug length bound (debt-hardening-batch).
// RED until assertSafeSlug enforces a maxLen (200) with a named length error.
// Covers: AC-101 (over-long slug → named length error before path build, no
// ENAMETOOLONG), AC-102 (boundary at exactly maxLen accepted), AC-103 (existing
// charset/traversal rejections intact — REJECT, never normalize).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_STORE = join(REPO_ROOT, '.claude/skills/harness/plan-store.mjs');
const MAX_LEN = 200;

describe('T1 assertSafeSlug length bound', () => {
  it('test_when_slug_over_maxlen_then_named_length_error', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    const overlong = 'a'.repeat(MAX_LEN + 1);
    assert.throws(
      () => assertSafeSlug(overlong),
      (err) => err instanceof Error && /length|\b200\b/i.test(err.message),
      'expected a named length error for a slug longer than maxLen',
    );
  });

  it('test_when_planpath_over_maxlen_then_throws_before_enametoolong', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    const huge = 'a'.repeat(300);
    assert.throws(
      () => assertSafeSlug(huge),
      (err) => err instanceof Error
        && err.code !== 'ENAMETOOLONG'
        && !/ENAMETOOLONG/.test(err.message),
      'must reject with the named error, never a raw ENAMETOOLONG',
    );
  });

  it('test_when_slug_at_maxlen_then_accepted', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    const atLimit = 'a'.repeat(MAX_LEN);
    assert.equal(assertSafeSlug(atLimit), atLimit);
  });

  it('test_when_slug_bad_charset_or_traversal_then_rejected', async () => {
    const { assertSafeSlug } = await import(PLAN_STORE);
    for (const bad of ['../x', '-x', 'Ab', '']) {
      assert.throws(() => assertSafeSlug(bad), Error, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });
});
