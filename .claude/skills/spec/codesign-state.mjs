// Foundation — codesign state file CRUD (AC-007). Manages
// .claude/state/codesign/<slug>.json across initial /spec drafting and
// integrate-failure re-entry. Synchronous filesystem ops (callers do not
// await).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REVISIT_CAP = 3;

function statePath(rootDir, slug) {
  return join(rootDir, '.claude/state/codesign', `${slug}.json`);
}

function loadState(rootDir, slug) {
  return JSON.parse(readFileSync(statePath(rootDir, slug), 'utf8'));
}

function saveState(rootDir, slug, state) {
  writeFileSync(statePath(rootDir, slug), JSON.stringify(state, null, 2));
}

export function loadForResume({ rootDir, slug }) {
  const state = loadState(rootDir, slug);
  const ctx = state.revisit_context;
  if (!ctx) return { revisit_target: null, state };
  const target = state.decisions.find((d) => d.id === ctx.decision_id);
  return { revisit_target: target || null, state };
}

export function attemptRevisit({ rootDir, slug, decision_id }) {
  const state = loadState(rootDir, slug);
  const decision = state.decisions.find((d) => d.id === decision_id);
  if (!decision) {
    return { final_state: 'needs_human', message: `Decision ${decision_id} not found in codesign state.` };
  }
  if ((decision.revisit_count ?? 0) >= REVISIT_CAP) {
    return {
      final_state: 'needs_human',
      message: `Revisit cap of ${REVISIT_CAP} reached for decision ${decision_id}; manual human intervention required.`,
    };
  }
  decision.revisit_count = (decision.revisit_count ?? 0) + 1;
  saveState(rootDir, slug, state);
  return { final_state: 'proceed', revisit_count: decision.revisit_count };
}
