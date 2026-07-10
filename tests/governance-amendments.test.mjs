// governance-amendments — Foundation layer (structural assertions over repo docs).
//
// Verifies the two governance amendments in this bundle:
//   - YAGNI purpose reframe (CLAUDE.md §VI.4 + seed.md §2.4 + src mirrors)
//   - read-before-overwrite convention (CLAUDE.md §VI.7 + src/CLAUDE.template.md)
//
// RED until /implement applies the doc edits from docs/handoff/{yagni-purpose-reframe,
// read-before-overwrite-convention}.md and their byte-equal src/*.template.md mirrors.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// Slice a document between a start heading and the next same-or-higher heading,
// so an assertion scoped to "§VI.4" cannot accidentally match text elsewhere.
function sliceSection(content, startRe, endRe) {
  const start = content.search(startRe);
  if (start < 0) return '';
  const rest = content.slice(start + 1);
  const endRel = rest.search(endRe);
  return endRel < 0 ? content.slice(start) : content.slice(start, start + 1 + endRel);
}

describe('YAGNI purpose reframe (Component 1)', () => {
  it('CLAUDE.md §VI.4 leads with a positive **Purpose.** bullet (AC-001)', () => {
    const vi4 = sliceSection(read('CLAUDE.md'), /###\s+VI\.4\s+YAGNI/, /###\s+VI\.5/);
    assert.match(vi4, /\*\*Purpose\.\*\*/, 'VI.4 missing **Purpose.** bullet');
    assert.match(vi4, /over-engineering/i);
    assert.match(vi4, /premature refactoring/i);
    assert.match(vi4, /stub/i);
    assert.match(vi4, /never.*(gate|decide|whether).*(deliver|scope)/i,
      'VI.4 Purpose must state YAGNI never gates spec-committed delivery');
  });

  it('CLAUDE.md §VI.4 and seed.md §2.4 both carry no-refactor + no-stub bullets (AC-002)', () => {
    const vi4 = sliceSection(read('CLAUDE.md'), /###\s+VI\.4\s+YAGNI/, /###\s+VI\.5/);
    const s24 = sliceSection(read('docs/init/seed.md'), /###\s+§?2\.4\s+YAGNI/, /###\s+§?2\.5/);
    for (const [label, section] of [['CLAUDE.md VI.4', vi4], ['seed.md §2.4', s24]]) {
      assert.match(section, /refactor pre-?emptively|restructure[\s\S]{0,40}third[\s\S]{0,20}use/i,
        `${label} missing no-preemptive-refactor bullet`);
      assert.match(section, /stub, placeholder, or scaffold/i,
        `${label} missing no-premature-stub bullet`);
    }
  });

  it('seed.md §2.4 carries the positive-purpose bullet (AC-002)', () => {
    const s24 = sliceSection(read('docs/init/seed.md'), /###\s+§?2\.4\s+YAGNI/, /###\s+§?2\.5/);
    assert.match(s24, /purpose/i);
    assert.match(s24, /over-engineering/i);
    assert.match(s24, /premature refactoring/i);
    assert.match(s24, /stub/i);
  });

  it('src/CLAUDE.template.md mirrors the VI.4 Purpose bullet (AC-003)', () => {
    assert.match(read('src/CLAUDE.template.md'), /\*\*Purpose\.\*\*/);
  });

  it('src/seed.template.md mirrors the §2.4 positive-purpose bullet (AC-003)', () => {
    const s24 = sliceSection(read('src/seed.template.md'), /###\s+§?2\.4\s+YAGNI/, /###\s+§?2\.5/);
    assert.match(s24, /purpose/i);
    assert.match(s24, /over-engineering/i);
  });
});

describe('read-before-overwrite convention (Component 2)', () => {
  it('CLAUDE.md Article VI carries a ### VI.7 Read before overwrite rule (AC-004)', () => {
    const claude = read('CLAUDE.md');
    assert.match(claude, /###\s+VI\.7\s+Read before overwrite/);
    const vi7 = sliceSection(claude, /###\s+VI\.7\s+Read before overwrite/, /###\s+VI\.8|##\s+Article VII/);
    assert.match(vi7, /SHALL Read it in-session first|Read[\s\S]{0,40}before[\s\S]{0,20}overwrit/i);
  });

  it('src/CLAUDE.template.md mirrors the VI.7 heading (AC-005)', () => {
    assert.match(read('src/CLAUDE.template.md'), /###\s+VI\.7\s+Read before overwrite/);
  });
});

describe('size cap (cross-cutting)', () => {
  it('CLAUDE.md stays under the 40000-char Article I.6 cap (AC-012)', () => {
    assert.ok(read('CLAUDE.md').length < 40000,
      `CLAUDE.md is ${read('CLAUDE.md').length} chars — over the 40000 cap`);
  });
});
