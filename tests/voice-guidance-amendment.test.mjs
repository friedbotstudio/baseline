// T1 — the voice-guidance amendment must land top-down (seed -> CLAUDE.md ->
// annex -> PRODUCT.md) without dropping a single anti-reference.
//
// RED until the amendment lands. These read DEV-REPO files, not tmp fixtures,
// so they double as integration verification for the live governance tree.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// The outcome-argument clause is identified by this invariant phrase; the
// amendment may word the surrounding prose freely.
const OUTCOME_CLAUSE = /headline SHALL assert what becomes true for the reader/i;

// Frozen pre-amendment ban list from PRODUCT.md "Anti-references". The
// amendment is additive; dropping any of these is the regression this defends.
const ANTI_REFERENCE_TOKENS = [
  'Gradient text',
  'glassy cards',
  'AI slop',
  'hero-metric',
  'AI-powered',
  '10x',
  'supercharge',
  'agentic',
  'revolutionary',
  'next-generation',
  'game-changing',
  'mascots',
];

// Article XI.1 slice only — prevents a false positive from prose elsewhere.
function articleSection(text, article) {
  const re = new RegExp(`### ${article}[\\s\\S]*?(?=\\n### XI\\.|\\n## Article |$)`);
  const m = re.exec(text);
  return m ? m[0] : '';
}

describe('T1 — voice guidance amendment', () => {
  it('test_when_seed_amended_then_template_mirror_matches', () => { // AC-001
    const seed = read('docs/init/seed.md');
    const tpl = read('src/seed.template.md');
    assert.match(seed, OUTCOME_CLAUSE, 'docs/init/seed.md must carry the outcome-argument clause');
    assert.match(tpl, OUTCOME_CLAUSE, 'src/seed.template.md must mirror the outcome-argument clause');
  });

  it('test_when_claude_md_amended_then_within_byte_cap_and_mirrored', () => { // AC-002
    const claude = read('CLAUDE.md');
    const tpl = read('src/CLAUDE.template.md');
    const xi1 = articleSection(claude, 'XI\\.1');
    assert.ok(xi1.length > 0, 'Article XI.1 section must be locatable');
    assert.match(xi1, OUTCOME_CLAUSE, 'Article XI.1 must reflect the outcome-argument clause');
    assert.ok(
      claude.length <= 40_000,
      `CLAUDE.md must stay within the 40,000-char cap (Art. I.6); got ${claude.length}`,
    );
    assert.equal(claude, tpl, 'src/CLAUDE.template.md must be a byte-equal mirror of CLAUDE.md');
  });

  it('test_when_annex_scope_row_added_then_carries_rule_decision_rationale', () => { // AC-003
    const annex = read('.claude/CONSTITUTION.md');
    const rows = [...annex.matchAll(/^\|(?!\s*-)([^\n]*\|[^\n]*\|[^\n]*)\|\s*$/gm)]
      .map((m) => m[1].split('|').map((c) => c.trim()));
    const scopeRow = rows.find((cells) => cells.some((c) => OUTCOME_CLAUSE.test(c)));
    assert.ok(scopeRow, 'annex §5.1 must gain a scope row citing the outcome-argument rule');
    assert.ok(
      scopeRow.filter((c) => c.length > 0).length >= 3,
      `scope row must populate rule, decision and rationale cells; got ${JSON.stringify(scopeRow)}`,
    );
  });

  it('test_when_product_md_revised_then_every_anti_reference_retained', () => { // AC-004
    const product = read('PRODUCT.md');
    for (const token of ANTI_REFERENCE_TOKENS) {
      assert.ok(
        product.includes(token),
        `PRODUCT.md must still ban "${token}" — the amendment is additive, never a repeal`,
      );
    }
    assert.match(product, OUTCOME_CLAUSE, 'PRODUCT.md must carry the outcome-argument clause');
  });
});
