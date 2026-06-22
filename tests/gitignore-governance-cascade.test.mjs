// AC-006 (+ AC-003 doc) — the double governance cascade (skill 41->42, hook 23->24)
// and the gitignore skill's documented contract.
//
// RED until the new skill dir + hook exist and every count surface is bumped.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_HOOKS } from '../.claude/skills/audit-baseline/expected-baseline.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const { SKILL_CATEGORIES } = await import(join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs'));
const SKILL_TOTAL = Object.values(SKILL_CATEGORIES).reduce((a, b) => a + b, 0);

describe('AC-006 — derived counts reach 43 skills / the declared hook roster', () => {
  it('test_when_counts_derived_then_43_skills_and_hook_roster', async () => {
    const { deriveCounts, SKILL_CATEGORIES } = await import(join(REPO_ROOT, '.claude/skills/audit-baseline/derive-counts.mjs'));
    const c = deriveCounts(REPO_ROOT);
    const sum = Object.values(SKILL_CATEGORIES).reduce((a, b) => a + b, 0);
    assert.equal(c.skills, sum, 'disk skills match the category breakdown');
    assert.equal(c.hooks, EXPECTED_HOOKS.size, 'top-level hooks match the declared roster');
  });

  it('test_when_expected_baseline_roster_then_includes_new_guard', () => {
    assert.match(read('.claude/skills/audit-baseline/expected-baseline.mjs'), /gitignore_leak_guard/, 'EXPECTED_HOOKS roster must include the new hook');
  });
});

describe('AC-006 — prose count surfaces agree (43 skills / the declared hook roster)', () => {
  for (const rel of ['docs/init/seed.md', 'CLAUDE.md', 'README.md', '.claude/CONSTITUTION.md']) {
    it(`test_when_${rel.replace(/[^a-z0-9]+/gi, '_')}_read_then_states_42_and_hook_count`, () => {
      const t = read(rel);
      assert.match(t, new RegExp(`(${SKILL_TOTAL})\\s+skills?`, 'i'), `${rel} must state ${SKILL_TOTAL} skills`);
      assert.match(t, new RegExp(`(${EXPECTED_HOOKS.size})\\s+hooks?`, 'i'), `${rel} must state ${EXPECTED_HOOKS.size} hooks`);
    });
  }
});

describe('AC-006 — mirrors stay consistent and CLAUDE.md within budget', () => {
  it('test_when_claude_md_then_byte_equal_to_template_and_under_cap', () => {
    assert.equal(read('CLAUDE.md'), read('src/CLAUDE.template.md'), 'CLAUDE.md must equal src/CLAUDE.template.md');
    assert.ok(read('CLAUDE.md').length <= 35500, `CLAUDE.md ${read('CLAUDE.md').length} > 35500`);
  });
});

describe('AC-003 — the gitignore skill documents gitignore.io + offline fallback', () => {
  it('test_when_skill_doc_read_then_documents_gitignoreio_and_offline_fallback', () => {
    const rel = '.claude/skills/gitignore/SKILL.md';
    assert.ok(existsSync(join(REPO_ROOT, rel)), 'gitignore SKILL.md must exist');
    const t = read(rel);
    assert.match(t, /owner:\s*baseline/, 'must be baseline-owned');
    assert.match(t, /gitignore\.io|toptal\.com\/developers\/gitignore/i, 'must document the gitignore.io service');
    assert.match(t, /offline|fallback/i, 'must document the offline fallback');
  });

  it('test_when_baseline_data_read_then_spans_secret_and_state', () => {
    const rel = '.claude/skills/gitignore/baseline-ignores.json';
    assert.ok(existsSync(join(REPO_ROOT, rel)), 'baseline-ignores.json must exist');
    const data = JSON.parse(read(rel));
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const cats = new Set(entries.map((e) => e.category));
    assert.ok(cats.has('secret'), 'must cover the secret category (e.g. .env*)');
    assert.ok(cats.has('state'), 'must cover the state category (e.g. .claude/state/)');
  });
});
