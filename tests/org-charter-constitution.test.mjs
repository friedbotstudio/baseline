import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// org-team-charter — the constitutional change (AC-007, AC-008). Article II must stay
// byte-unchanged (the charter is a different axis); a new Article X "Multi-session
// coordinated workflows" lands between IX and old X; old X (project-specific)→XI and
// old XI (provenance)→XII; mirrors byte-equal; audit-baseline green. No mocks — the
// real files + the real audit are the system under test.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function articleSection(text, roman) {
  const re = new RegExp(`^## Article ${roman}\\b[\\s\\S]*?(?=^## Article |^## Appendix |\\Z)`, 'm');
  const m = re.exec(text);
  return m ? m[0] : null;
}

const claudeMd = () => readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

test('test_when_article_X_added_then_article_II_is_byte_unchanged', () => {
  // Regression trap: the charter SHALL NOT touch Article II (intra-session axis).
  const head = execFileSync('git', ['show', 'HEAD:CLAUDE.md'], { cwd: ROOT, encoding: 'utf8' });
  const headII = articleSection(head, 'II');
  const workII = articleSection(claudeMd(), 'II');
  assert.ok(headII, 'Article II is locatable in HEAD');
  assert.equal(workII, headII, 'Article II text is byte-identical to HEAD (charter does not amend Article II)');
});

test('test_when_charter_lands_then_article_X_is_the_multi_session_article', () => {
  const x = articleSection(claudeMd(), 'X');
  assert.ok(x, 'Article X exists');
  assert.match(x.split('\n')[0], /Multi-session coordinated workflows/i, 'Article X is the new multi-session coordination article');
});

test('test_when_renumber_then_project_specific_is_XI_and_provenance_is_XII', () => {
  const text = claudeMd();
  assert.match(articleSection(text, 'XI')?.split('\n')[0] || '', /Project-specific/i, 'old Article X (project-specific rules) is now Article XI');
  assert.match(articleSection(text, 'XII')?.split('\n')[0] || '', /provenance|manifest/i, 'old Article XI (skill provenance) is now Article XII');
});

test('test_when_charter_lands_then_claude_md_and_template_mirror_are_byte_equal', () => {
  // The autosync build keeps src/CLAUDE.template.md a byte-equal mirror (Art. provenance).
  const live = claudeMd();
  const mirror = readFileSync(join(ROOT, 'src/CLAUDE.template.md'), 'utf8');
  assert.equal(mirror, live, 'src/CLAUDE.template.md is a byte-equal mirror of CLAUDE.md');
});

test('test_when_renumber_then_hook_to_article_mapping_cites_new_provenance_number', () => {
  // Article VIII maps hooks→articles by number; the design-calls guard cites the
  // project-specific article (X.2 → XI.2 after renumber).
  const viii = articleSection(claudeMd(), 'VIII');
  assert.ok(viii, 'Article VIII present');
  assert.equal(/Art\.?\s*X\.2\b/.test(viii), false, 'no stale Art. X.2 citation remains (renumbered to XI.2)');
});

test('test_when_full_change_then_audit_baseline_passes', () => {
  // Exit 0 = PASS. A non-zero exit throws with the audit's FAIL output.
  const out = execFileSync('node', ['.claude/skills/audit-baseline/audit.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /PASS|OK/i, 'audit-baseline reports PASS after the charter change');
});
