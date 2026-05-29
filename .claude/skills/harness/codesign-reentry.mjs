// Foundation — codesign re-entry context writer (AC-007). On integrate-fail
// classified as needs-spec-change with codesign_mode: true, harness appends
// a revisit_context block to .claude/state/codesign/<slug>.json so the next
// /spec invocation knows which decision to revisit.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeRevisitContext({ rootDir, slug, failing_ac, behavior, decision_id }) {
  const path = join(rootDir, '.claude/state/codesign', `${slug}.json`);
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.revisit_context = {
    failing_ac,
    behavior,
    decision_id,
    set_at: Date.now(),
  };
  writeFileSync(path, JSON.stringify(state, null, 2));
}
