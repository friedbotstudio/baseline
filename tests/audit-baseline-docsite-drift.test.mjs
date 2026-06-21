// WF-6 (audit-baseline-misses-docsite-prose-and-hooks-table-drift) — audit-baseline
// must catch hand-maintained docsite drift, not just the templated counts.
//
// audit.mjs already pins the derived COUNTS into the docsite via {{ baseline.* }}
// template variables (WF-5). These checks pin the hand-maintained PROSE: the
// workflows.njk track list must enumerate every selectable track, and the two
// hooks.njk tables must enumerate every hook on disk. A new hook or track that
// lands without a matching docs-page edit must FAIL the audit, not pass silently.
//
// RED until: .claude/skills/audit-baseline/audit.mjs exports sectionSlice,
// checkDocsiteTracks, and checkDocsiteHookTable.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');

const enforceRow = (h) => `<td class="phase">${h}</td>`;

// A by-event-table region shaped like the real hooks.njk: comma-joined hook
// names per <td class="phase"> cell, with id="boundary" / id="article" anchors.
const EVENT_REGION = [
  '<h2 id="boundary">Hooks by tool boundary</h2>',
  '<tr><td>Stop</td><td class="phase">memory_stop, harness_continuation</td></tr>',
  '<h2 id="article">What each hook enforces</h2>',
].join('\n');

const ENFORCE_REGION = [
  '<h2 id="article">What each hook enforces</h2>',
  `<tr>${enforceRow('memory_stop')}<td>IX</td><td>x</td></tr>`,
  `<tr>${enforceRow('harness_continuation')}<td>V</td><td>y</td></tr>`,
  '<h2 id="consent">Why consent gates are unforgeable</h2>',
].join('\n');

describe('AC-001 — checkDocsiteTracks flags a selectable track missing from workflows.njk', () => {
  it('test_when_track_missing_from_workflows_njk_then_fail', async () => {
    const { checkDocsiteTracks } = await import(AUDIT);
    const njk = '<li><code>intake-full</code></li>\n<li><code>chore</code></li>';
    const r = checkDocsiteTracks(njk, ['intake-full', 'chore', 'freeform']);
    assert.equal(r.status, 'FAIL');
    assert.match(r.detail, /freeform/, 'detail names the omitted track_id');
  });

  it('test_when_all_tracks_listed_then_pass', async () => {
    const { checkDocsiteTracks } = await import(AUDIT);
    const ids = ['intake-full', 'chore', 'freeform'];
    const njk = ids.map((id) => `<li><code>${id}</code></li>`).join('\n');
    const r = checkDocsiteTracks(njk, ids);
    assert.equal(r.status, 'PASS');
  });
});

describe('AC-002 — checkDocsiteHookTable flags a hook missing from a hooks.njk table', () => {
  it('test_when_hook_missing_from_enforcement_table_then_fail', async () => {
    const { checkDocsiteHookTable } = await import(AUDIT);
    const hooks = ['memory_stop', 'harness_continuation', 'phase_timer'];
    const r = checkDocsiteHookTable(ENFORCE_REGION, hooks, enforceRow);
    assert.equal(r.status, 'FAIL');
    assert.match(r.detail, /phase_timer/, 'detail names the hook with no enforcement row');
  });

  it('test_when_hook_missing_from_byevent_table_then_fail', async () => {
    const { checkDocsiteHookTable } = await import(AUDIT);
    const hooks = ['memory_stop', 'harness_continuation', 'phase_timer'];
    const r = checkDocsiteHookTable(EVENT_REGION, hooks, (h) => h);
    assert.equal(r.status, 'FAIL');
    assert.match(r.detail, /phase_timer/, 'detail names the hook absent from the by-event region');
  });

  it('test_when_all_hooks_in_both_tables_then_pass', async () => {
    const { checkDocsiteHookTable } = await import(AUDIT);
    const hooks = ['memory_stop', 'harness_continuation'];
    assert.equal(checkDocsiteHookTable(EVENT_REGION, hooks, (h) => h).status, 'PASS');
    assert.equal(checkDocsiteHookTable(ENFORCE_REGION, hooks, enforceRow).status, 'PASS');
  });
});

describe('AC-003 — sectionSlice extracts the region between two anchors', () => {
  it('test_when_sectionSlice_extracts_region_between_anchors', async () => {
    const { sectionSlice } = await import(AUDIT);
    const text = 'A id="boundary" B id="article" C id="consent" D';
    const region = sectionSlice(text, 'boundary', 'article');
    assert.ok(region.includes('id="boundary"'));
    assert.ok(region.includes(' B '));
    assert.ok(!region.includes('id="article"'), 'stops before the end anchor');
    assert.equal(sectionSlice(text, 'nope', 'article'), '', 'missing start anchor yields empty');
    assert.ok(sectionSlice(text, 'consent', 'nope').includes(' D'), 'missing end anchor yields the tail');
  });
});

describe('AC-004 — the live docsite tree is drift-free (regression guard)', () => {
  it('test_when_real_docsite_clean_then_checks_pass', async () => {
    const { checkDocsiteTracks, checkDocsiteHookTable, sectionSlice } = await import(AUDIT);

    const workflowsNjk = readFileSync(join(REPO_ROOT, 'site-src/workflows.njk'), 'utf8');
    const selectableIds = readFileSync(join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8')
      .split('\n').filter((l) => l.trim())
      .map((l) => JSON.parse(l)).filter((t) => t.selectable === true).map((t) => t.track_id);
    assert.equal(checkDocsiteTracks(workflowsNjk, selectableIds).status, 'PASS');

    const hooksNjk = readFileSync(join(REPO_ROOT, 'site-src/hooks.njk'), 'utf8');
    const hooks = readdirSync(join(REPO_ROOT, '.claude/hooks'))
      .filter((n) => n.endsWith('.mjs')).map((n) => n.replace(/\.mjs$/, ''));
    const eventRegion = sectionSlice(hooksNjk, 'boundary', 'article');
    const enforceRegion = sectionSlice(hooksNjk, 'article', 'consent');
    assert.equal(checkDocsiteHookTable(eventRegion, hooks, (h) => h).status, 'PASS');
    assert.equal(checkDocsiteHookTable(enforceRegion, hooks, enforceRow).status, 'PASS');
  });
});
