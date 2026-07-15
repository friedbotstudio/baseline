// A5 — Class-driven skip_brainstorm. RED until resolveSkipBrainstorm honors the
// governanceClass param: D skips, A/B cannot (hard floor, overrides
// --no-brainstorm), C/undefined unchanged (back-compat).
// Covers: AC-501 (Class D skips), AC-502 (Class A/B cannot skip, floor wins),
// AC-503 (C/undefined unchanged back-compat).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FP = join(REPO_ROOT, '.claude/skills/triage/flag-parser.mjs');

describe('A5 Class-driven skip_brainstorm', () => {
  it('test_when_resolveSkipBrainstorm_D_then_true', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ governanceClass: 'D' }), true);
  });

  it('test_when_resolveSkipBrainstorm_A_no_brainstorm_flag_then_false', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ governanceClass: 'A', no_brainstorm_flag: true }), false);
  });

  it('test_when_resolveSkipBrainstorm_B_spec_derived_then_false', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ governanceClass: 'B', novelty: 'spec-derived' }), false);
  });

  it('test_when_resolveSkipBrainstorm_spec_derived_no_class_then_true', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ novelty: 'spec-derived' }), true);
  });

  it('test_when_resolveSkipBrainstorm_novel_incomplete_no_class_then_false', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ novelty: 'novel', complete_framing: false }), false);
  });

  it('test_when_resolveSkipBrainstorm_C_falls_through_to_novelty', async () => {
    const { resolveSkipBrainstorm } = await import(FP);
    assert.equal(resolveSkipBrainstorm({ governanceClass: 'C', novelty: 'pattern-copy' }), true);
    assert.equal(resolveSkipBrainstorm({ governanceClass: 'C', novelty: 'ambiguous' }), false);
  });
});
