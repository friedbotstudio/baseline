// Domain — surface drifted elements to the curator at Step 0c.
//
// Detection is mechanical; re-stamping is not (spec D3). This module only LISTS
// what drifted — it never stamps. The curator reviews each element against the
// code at its anchor and calls digest.stampElement for the ones it verified;
// anything left unreviewed surfaces again at the next flush, which is the whole
// point. A module that both detected and refreshed would quietly close the loop
// with no human in it.
//
// Sited at /memory-sync rather than /scout (D4): scout is the intuitive home and
// the wrong one, because `spec-entry` — this repository's most-used track — carries
// scout in `exceptions`, so a scout-sited check would rarely fire.

import { architectureMapEnabled } from '../workspace/flags.mjs';
import { classify } from '../workspace/reconcile.mjs';

export function listStale({ specDir, rootDir = process.cwd() } = {}) {
  if (!architectureMapEnabled({ rootDir })) return [];
  try {
    return classify(specDir, { rootDir })
      .filter((verdict) => verdict.state === 'stale')
      .map((verdict) => ({ id: verdict.element_id, detail: verdict.detail }));
  } catch {
    // Fail-open, matching surfaceScopedMemory: an unreadable corpus degrades to
    // "nothing to review", never to a flush that throws.
    return [];
  }
}
