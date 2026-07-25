// ac-conformance checker (C5) — the merge oracle on the checker interface.
// Verifies the code diff satisfies each acceptance criterion of the approved spec:
// an AC id not referenced anywhere in the diff is unsatisfied. Reuses drift_check's
// AC extraction. Fail-open when the flag is off or no spec resolves.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCheckerThreshold } from '../../../hooks/lib/tier-dial.mjs';
import { extractAcIds } from '../../tdd/drift_check.mjs';
// Predicate form (T2 hoist): this checker is fail-open by contract, so an unsafe
// slug degrades to an empty finding set rather than throwing into the fan-out.
import { isSafeSlug } from '../../../hooks/lib/slug.mjs';

function readProjectJson(rootDir) {
  try { return JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8')); }
  catch { return {}; }
}
function isEnabled(rootDir) {
  return readProjectJson(rootDir)?.velocity?.ac_conformance?.enabled === true;
}

// An AC is satisfied when its id appears in the diff. floor=1 means "all ACs";
// severity from `mandatory` (ac-conformance ships mandatory → BLOCKER on any miss).
export function findingsFromAcs(acIds, diffContent, { mandatory } = {}) {
  const unsatisfied = acIds.filter((id) => !String(diffContent).includes(id));
  if (unsatisfied.length === 0) return [];
  const severity = mandatory ? 'BLOCKER' : 'ADVISORY';
  return unsatisfied.map((id) => ({
    severity,
    checker: 'ac-conformance',
    message: `AC ${id} unsatisfied — not referenced in the diff`,
    evidence: id,
  }));
}

export const acConformanceAdapter = {
  phase: 'code-review',
  async run(ctx) {
    if (!isEnabled(ctx.rootDir)) return { findings: [] };
    if (!isSafeSlug(ctx.slug || '')) return { findings: [] };
    const specPath = join(ctx.rootDir, 'docs/specs', `${ctx.slug}.md`);
    if (!existsSync(specPath)) return { findings: [] };
    const acIds = extractAcIds(readFileSync(specPath, 'utf8'));
    if (acIds.length === 0) return { findings: [] };
    const threshold = resolveCheckerThreshold('ac-conformance', { projectJson: readProjectJson(ctx.rootDir) });
    return { findings: findingsFromAcs(acIds, ctx.diffContent || '', threshold) };
  },
};
