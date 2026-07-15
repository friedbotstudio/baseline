// mutation-score checker (C5) — a non-UI oracle on the checker interface.
// Grades test-suite strength: a low mutation score means the tests do not actually
// pin behavior. The score comes from a runner supplied via `ctx.oracleRunner` (the
// mutation engine is a dev-only tool wired in on the baseline's own tree, never
// shipped). Fail-open when the flag is off, no target resolves, or no runner is
// supplied — so it adds nothing to a consumer install (the flag ships off).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCheckerThreshold } from '../../../hooks/lib/tier-dial.mjs';

function readProjectJson(rootDir) {
  try { return JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8')); }
  catch { return {}; }
}
function isEnabled(rootDir) {
  return readProjectJson(rootDir)?.velocity?.mutation_oracle?.enabled === true;
}

// Binary on the floor; severity comes from `mandatory` (the tier-dial `ceiling` is a
// rounds count, not a score band — there is no floor..ceiling ADVISORY band).
export function verdictFromScore(score, { floor, mandatory } = {}) {
  if (score === null || score === undefined || floor === null || floor === undefined) return null;
  if (score >= floor) return null;
  return {
    severity: mandatory ? 'BLOCKER' : 'ADVISORY',
    checker: 'mutation-score',
    message: `mutation score ${score} < floor ${floor}`,
    evidence: `score=${score} floor=${floor}`,
  };
}

// One changed source module + its co-named test, drawn from the diff's file list.
export function resolveMutationTarget(changedFiles = []) {
  const isTest = (f) => /\.test\.(mjs|js)$/.test(f);
  const src = changedFiles.find((f) => /\.(mjs|js)$/.test(f) && !isTest(f) && !f.startsWith('tests/'));
  if (!src) return null;
  const base = src.split('/').pop().replace(/\.(mjs|js)$/, '');
  const test = changedFiles.find((f) => isTest(f) && f.includes(base));
  return test ? { module: src, test } : null;
}

export const mutationScoreAdapter = {
  phase: 'code-review',
  async run(ctx) {
    if (!isEnabled(ctx.rootDir)) return { findings: [] };
    const target = resolveMutationTarget(ctx.changedFiles);
    if (!target || typeof ctx.oracleRunner !== 'function') return { findings: [] };
    let score;
    try {
      score = await ctx.oracleRunner(target.module, target.test, ctx.rootDir);
    } catch {
      return { findings: [] }; // runner failed → fail-open (never break a landing)
    }
    const threshold = resolveCheckerThreshold('tdd', { projectJson: readProjectJson(ctx.rootDir) });
    const f = verdictFromScore(score, threshold);
    return { findings: f ? [f] : [] };
  },
};
