// Club B — /document reflective public-site trigger (7b3e + 5e07).
//
// findDescribedSurfaces derives the skill/hook tokens a diff touches and greps
// the public site (`site-src/**/*.njk`) for pages that DESCRIBE them — so a
// behavior change surfaces the public page even when no site file is in the
// diff (5e07, reflective). /document Step 2 then routes those pages through the
// reference register AND the persuasive/feature-value register (7b3e).
//
// RED until: .claude/skills/document/public-site-reflect.mjs exists and exports
// findDescribedSurfaces; document/SKILL.md Step 2 documents both triggers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = join(REPO_ROOT, '.claude/skills/document/public-site-reflect.mjs');

// Build a throwaway repo-shaped fixture: one skill dir + one public page that
// mentions that skill slug. Returns the tmp root.
function makeFixture(pageMentions) {
  const root = mkdtempSync(join(tmpdir(), 'docref-'));
  mkdirSync(join(root, '.claude/skills/foo-skill'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/foo-skill/SKILL.md'), '---\nname: foo-skill\nowner: baseline\n---\n');
  mkdirSync(join(root, 'site-src'), { recursive: true });
  writeFileSync(join(root, 'site-src/features.njk'), `<p>${pageMentions}</p>\n`);
  return root;
}

// Deep snapshot of names+mtimes under a dir (to assert no writes happened).
function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${p}:${statSync(p).mtimeMs}`);
    }
  };
  walk(dir);
  return out.sort().join('\n');
}

describe('AC-001 / AC-003 — reflective public-page detection by changed token', () => {
  it('test_when_changed_skill_token_appears_in_site_page_then_surface_reflectively', async () => {
    const { findDescribedSurfaces } = await import(HELPER);
    const root = makeFixture('The foo-skill helps you do X without losing your place.');
    try {
      // changedPaths has NO site-src file — only the skill — yet the page is surfaced.
      const surfaces = findDescribedSurfaces({ changedPaths: ['.claude/skills/foo-skill/SKILL.md'], root });
      const pages = surfaces.map((s) => s.page);
      assert.ok(pages.some((p) => p.includes('features.njk')), `expected features.njk surfaced; got ${JSON.stringify(pages)}`);
      assert.equal(surfaces[0].token, 'foo-skill');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_changed_token_absent_from_all_pages_then_empty', async () => {
    const { findDescribedSurfaces } = await import(HELPER);
    const root = makeFixture('This page talks about something unrelated entirely.');
    try {
      const surfaces = findDescribedSurfaces({ changedPaths: ['.claude/skills/bar-skill/SKILL.md'], root });
      assert.deepEqual(surfaces, [], 'a token absent from every page must yield no surfaces (no false trigger)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-005 — the reflective check is read-only', () => {
  it('test_when_findDescribedSurfaces_runs_then_no_writes', async () => {
    const { findDescribedSurfaces } = await import(HELPER);
    const root = makeFixture('The foo-skill is documented here.');
    try {
      const before = snapshot(root);
      findDescribedSurfaces({ changedPaths: ['.claude/skills/foo-skill/SKILL.md'], root });
      assert.equal(snapshot(root), before, 'helper must not create/modify any file');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-002 / AC-004 — SKILL.md documents the reflective check + persuasive register', () => {
  it('test_when_document_skill_md_then_documents_reflective_and_persuasive_split', async () => {
    const sop = readFileSync(join(REPO_ROOT, '.claude/skills/document/SKILL.md'), 'utf8');
    assert.match(sop, /findDescribedSurfaces|public-site-reflect/, 'Step 2 must reference the reflective check helper');
    assert.match(sop, /persuasive|copywriting|feature[\s-]?value/i, 'Step 2 must route public-site surfaces through the persuasive/feature-value register');
  });
});
