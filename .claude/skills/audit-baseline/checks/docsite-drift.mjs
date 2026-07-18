// WF-6: docsite prose + table drift — the workflows.njk track list must
// enumerate every selectable track, and the two hooks.njk tables every hook on
// disk, so a new track/hook cannot ship with a silently stale docs page. Skipped
// on consumer installs with no site-src/ tree (readText returns '').
import { checkDocsiteTracks, checkDocsiteHookTable, sectionSlice } from './surface-helpers.mjs';

function selectableTrackIds(ctx) {
  const text = ctx.readText('.claude/workflows.jsonl');
  if (!text) return [];
  const ids = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let track;
    try { track = JSON.parse(line); } catch { continue; }
    if (track.selectable === true && typeof track.track_id === 'string') ids.push(track.track_id);
  }
  return ids;
}

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);

  const workflowsNjk = ctx.readText('site-src/workflows.njk');
  if (workflowsNjk) {
    const r = checkDocsiteTracks(workflowsNjk, selectableTrackIds(ctx));
    add('docsite: workflows.njk lists every selectable track', r.status, r.detail);
  }

  const hooksNjk = ctx.readText('site-src/hooks.njk');
  if (hooksNjk) {
    const hooks = [...ctx.diskBaselineHooks].sort();
    const eventCheck = checkDocsiteHookTable(sectionSlice(hooksNjk, 'boundary', 'article'), hooks, h => h);
    add('docsite: hooks.njk by-event table covers every hook', eventCheck.status, eventCheck.detail);
    const enforceCheck = checkDocsiteHookTable(sectionSlice(hooksNjk, 'article', 'consent'), hooks, h => `<td class="phase">${h}</td>`);
    add('docsite: hooks.njk enforcement table covers every hook', enforceCheck.status, enforceCheck.detail);
  }
  return rows;
}
