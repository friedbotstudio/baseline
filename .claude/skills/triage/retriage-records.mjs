// Foundation — the two records a confirmed retriage grouping materializes.
//
// Pure shaping: no I/O, no path construction, no decision about what belongs in
// a group. Split out of retriage.mjs, which writes them.

import { assertAcIdShape } from '../lib/epic-acs.mjs';

export function absorbedKeys(slices) {
  return [...new Set(slices.flatMap((slice) => slice.backlogKeys ?? []))];
}

export function epicStateFor({ epicSlug, slices }) {
  return {
    epic: epicSlug,
    spec: `docs/specs/${epicSlug}.md`,
    scout: `docs/scout/${epicSlug}.md`,
    research: `docs/research/${epicSlug}.md`,
    slices: slices.map(({ id, title, acs }) => {
      const ids = acs ?? [];
      assertAcIdShape(ids, `slices[${JSON.stringify(id)}].acs`);
      return { id, title, acs: ids, risk: [] };
    }),
    approved: false,
    children: [],
  };
}

export function workflowFor({ epicSlug, title, slices }) {
  const keys = absorbedKeys(slices);
  const now = Math.floor(Date.now() / 1000);
  return {
    request: `Epic ${title}, retriaged from ${keys.length} open backlog entries.`,
    slug: epicSlug,
    track_id: 'epic',
    novelty: 'spec-derived',
    novelty_evidence: `Grouped from open backlog entries: ${keys.join(', ')}.`,
    skip_brainstorm: true,
    exceptions: [],
    completed: [],
    skipped_alternates: [],
    source_backlog_keys: keys,
    created_at: now,
    updated_at: now,
  };
}

// --- Orchestration: write only what the human confirmed ----------------------

