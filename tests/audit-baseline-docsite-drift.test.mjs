// WF-6 (audit-baseline-misses-docsite-prose-and-hooks-table-drift) — audit-baseline
// must catch docsite roster drift: a hook, track, skill or MCP server that lands
// without appearing on the page claiming to list it.
//
// REWRITTEN against checks/docsite-drift.mjs. The original version drove three
// pure helpers (sectionSlice / checkDocsiteTracks / checkDocsiteHookTable) that
// scanned `site-src/*.njk` for literal names. Those pages now build their rosters
// from a `{% for %}` over _data, so no name appears in the template source at all
// and the helpers could only fail against a correct page. They have been deleted;
// this file drives the real check, which reads the rendered tree.
//
// The teeth test matters most. The predecessor check went vacuous once — it
// emitted zero rows while audit-baseline still reported PASS — so "a missing name
// produces a FAIL that names it" is asserted directly rather than assumed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRIFT = join(REPO_ROOT, '.claude/skills/audit-baseline/checks/docsite-drift.mjs');

// Minimal stand-in for the audit's frozen ctx: the check uses `root` and
// `readText`, and readText yields '' for anything absent.
function realCtx(overrides = {}) {
  return {
    root: REPO_ROOT,
    readText(rel) {
      if (Object.prototype.hasOwnProperty.call(overrides, rel)) return overrides[rel];
      const full = join(REPO_ROOT, rel);
      return existsSync(full) ? readFileSync(full, 'utf8') : '';
    },
  };
}

const rowFor = (rows, needle) => rows.find(([name]) => name.includes(needle));

describe('AC-001 — a name missing from its page is a FAIL that names it', () => {
  it('test_when_hook_absent_from_rendered_page_then_fail_names_it', async () => {
    const { run } = await import(DRIFT);

    // Strip one hook from the rendered hooks page and nothing else.
    const real = readFileSync(join(REPO_ROOT, 'obj/site/hooks/index.html'), 'utf8');
    const mutated = real.replaceAll('env_guard', 'REDACTED_HOOK');

    const rows = run(realCtx({ 'obj/site/hooks/index.html': mutated }));
    const row = rowFor(rows, 'hooks/index.html');
    assert.ok(row, 'the hooks page must produce a row');
    assert.equal(row[1], 'FAIL', 'a hook missing from the page must FAIL');
    assert.match(row[2], /env_guard/, 'the detail must name the missing hook');
  });

  it('test_when_track_absent_from_rendered_page_then_fail_names_it', async () => {
    const { run } = await import(DRIFT);
    const real = readFileSync(join(REPO_ROOT, 'obj/site/workflows/index.html'), 'utf8');
    const mutated = real.replaceAll('freeform', 'REDACTED_TRACK');

    const rows = run(realCtx({ 'obj/site/workflows/index.html': mutated }));
    const row = rowFor(rows, 'workflows/index.html');
    assert.equal(row[1], 'FAIL', 'a selectable track missing from the page must FAIL');
    assert.match(row[2], /freeform/, 'the detail must name the missing track');
  });
});

describe('AC-002 — an unbuilt page reports rather than passing silently', () => {
  it('test_when_page_not_built_then_skip_states_the_unlisted_count', async () => {
    const { run } = await import(DRIFT);
    const rows = run(realCtx({ 'obj/site/skills/index.html': '' }));
    const row = rowFor(rows, 'skills/index.html');
    assert.equal(row[1], 'SKIP', 'an unbuilt page is SKIP, never PASS');
    assert.match(row[2], /\d+ unlisted/, 'the SKIP detail must state how many names went unchecked');
  });

  it('test_when_site_absent_entirely_then_one_skip_row_and_no_silence', async () => {
    const { run } = await import(DRIFT);
    const rows = run(realCtx({ 'obj/site/index.html': '' }));
    assert.equal(rows.length, 1, 'a consumer install with no site tree yields exactly one row');
    assert.equal(rows[0][1], 'SKIP');
    assert.match(rows[0][2], /npm run build:site/, 'the row must say how to produce the tree');
  });
});

describe('AC-003 — the live docsite tree is drift-free (regression guard)', () => {
  it('test_when_real_docsite_clean_then_every_row_passes', async () => {
    const { run } = await import(DRIFT);
    const rows = run(realCtx());
    assert.ok(rows.length >= 4, `expected a row per enumerating page; got ${rows.length}`);
    const notPassing = rows.filter(([, status]) => status !== 'PASS');
    assert.deepEqual(
      notPassing,
      [],
      `every docsite roster row must PASS against the built tree: ${JSON.stringify(notPassing)}`,
    );
  });
});
