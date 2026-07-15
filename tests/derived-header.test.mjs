// Slice T3 — derived-from header lib (debt-hardening-batch).
// RED until .claude/hooks/lib/derived-header.mjs exists.
// Covers: AC-201 (marker/exempt/stamp/detect primitives), boundary (idempotent
// double-stamp), AC-202 (constitution mirrors exempt), and the mirror-stays-
// header-free invariant that KEEPS the mirrors byte-equal to their live source —
// i.e. AC-204 (audit-baseline byte-equality still PASSes). AC-203 (audit FAILs on a
// mirror that carries the banner) is exercised by running audit-baseline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HDR = join(REPO_ROOT, '.claude/hooks/lib/derived-header.mjs');

describe('T3 derived-header stamp + detect', () => {
  it('test_when_eligible_text_stamped_then_header_present', async () => {
    const { stampText, hasDerivedHeader } = await import(HDR);
    const body = '# Title\n\nsome generated body\n';
    assert.equal(hasDerivedHeader(body), false, 'plain body has no header');
    const stamped = stampText(body, 'CLAUDE.md');
    assert.equal(hasDerivedHeader(stamped), true, 'stamped body is detected');
    assert.ok(stamped.trimStart().startsWith('<!--') || stamped.startsWith('<!--'),
      'header sits at the top of the file');
  });

  it('test_when_stamp_applied_twice_then_idempotent', async () => {
    const { stampText, hasDerivedHeader } = await import(HDR);
    const once = stampText('# T\n', 'src/x.template.md');
    const twice = stampText(once, 'src/x.template.md');
    assert.equal(twice, once, 're-stamping is a no-op');
    assert.equal(hasDerivedHeader(twice), true);
  });
});

describe('T3 exempt set (constitution mirrors)', () => {
  it('test_when_mirror_path_then_isExempt_true', async () => {
    const { isExempt, EXEMPT_RELPATHS } = await import(HDR);
    assert.equal(isExempt('src/CLAUDE.template.md'), true);
    assert.equal(isExempt('src/seed.template.md'), true);
    assert.equal(isExempt('.claude/hooks/lib/derived-header.mjs'), false);
    const exemptList = [...EXEMPT_RELPATHS];
    assert.ok(exemptList.includes('src/CLAUDE.template.md'), 'exempt set names the CLAUDE mirror');
    assert.ok(exemptList.includes('src/seed.template.md'), 'exempt set names the seed mirror');
  });
});

describe('T3 mirror exemption invariant (what audit-baseline enforces)', () => {
  it('test_when_constitution_mirrors_then_no_derived_header', async () => {
    const { hasDerivedHeader, EXEMPT_RELPATHS } = await import(HDR);
    for (const rel of EXEMPT_RELPATHS) {
      const p = join(REPO_ROOT, rel);
      if (!existsSync(p)) continue; // obj/template outputs exist only after a build
      assert.equal(
        hasDerivedHeader(readFileSync(p, 'utf8')), false,
        `${rel} must NOT carry a derived header (byte-equality is its guard)`,
      );
    }
  });
});
