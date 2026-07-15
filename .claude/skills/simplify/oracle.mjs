// simplify oracle (code-review phase) — reads the /simplify verdict table and emits a
// finding per `flagged` row (an out-of-scope refactor the reviewer noted). Read-only;
// never throws. Reads the `review` tier-dial threshold (simplify is a review checker).

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

const CHECKER = 'review';
export const phase = 'code-review';

function tableRowCells(line) {
  if (!line.includes('|')) return null;
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  return cells.length >= 3 ? cells : null;
}

export function runSimplifyOracle({ simplifyTable } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  const text = String(simplifyTable == null ? '' : simplifyTable);
  for (const line of text.split(/\r?\n/)) {
    const cells = tableRowCells(line);
    if (!cells || !/^flagged$/i.test(cells[1])) continue;
    findings.push(normalizeFinding({
      check: 'simplify_flag',
      file: cells[0],
      line: null,
      evidence: cells[2],
      message: `Simplify flagged ${cells[0]}: ${cells[2]}`,
      suggested_fix: 'Address the flagged cleanup or record why it is deferred.',
      artifact: { kind: 'simplify-flag', file: cells[0] },
    }, { mandatory }));
  }
  return { findings };
}
