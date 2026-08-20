// simplify oracle (code-review phase) — reads the /simplify verdict table and emits a
// finding per `flagged` row (an out-of-scope refactor the reviewer noted). Read-only;
// never throws. Reads the `review` tier-dial threshold (simplify is a review checker).

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

const CHECKER = 'review';
export const phase = 'code-review';

// Anchored, not a substring search: a severity decision that reads English adverbs is a
// severity decision nobody can predict, so "not inherited: ..." blocks (D4).
const INHERITED = /^inherited:/i;

// Border pipes produce empty leading and trailing cells; interior empties are content.
// Dropping every empty cell made a flagged row with no reason parse to two cells and fall
// under the length check, so an unreasoned flag emitted nothing at all and left the gate.
function tableRowCells(line) {
  if (!line.includes('|')) return null;
  const cells = line.split('|').map((c) => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells[cells.length - 1] === '') cells.pop();
  return cells.length >= 2 && cells[0].length > 0 ? cells : null;
}

function flaggedRow(cells) {
  const file = cells[0];
  const reason = cells[2] === undefined ? '' : cells[2];
  return {
    file,
    reason,
    inherited: INHERITED.test(reason),
    message: reason === ''
      ? `Simplify flagged ${file} with no reason given.`
      : `Simplify flagged ${file}: ${reason}`,
  };
}

export function runSimplifyOracle({ simplifyTable } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  const text = String(simplifyTable == null ? '' : simplifyTable);
  for (const line of text.split(/\r?\n/)) {
    const cells = tableRowCells(line);
    if (!cells || !/^flagged$/i.test(cells[1])) continue;
    const row = flaggedRow(cells);
    findings.push(normalizeFinding({
      check: 'simplify_flag',
      file: row.file,
      line: null,
      evidence: row.reason,
      message: row.message,
      suggested_fix: 'Address the flagged cleanup or record why it is deferred.',
      artifact: { kind: 'simplify-flag', file: row.file },
    }, { mandatory: mandatory && !row.inherited }));
  }
  return { findings };
}
