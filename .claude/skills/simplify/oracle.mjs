// simplify oracle (code-review phase) — reads the /simplify verdict table and emits a
// finding per `flagged` row (an out-of-scope refactor the reviewer noted). Read-only;
// never throws. Reads the `review` tier-dial threshold (simplify is a review checker).

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';
import { clip } from '../lib/terminal-text.mjs';

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

// The verdict column is the fixed vocabulary simplify/SKILL.md defines. A path may
// legally contain a pipe and so may a reason, so counting cells from either end drops
// the row silently — which is how a file the reviewer explicitly flagged left the gate
// with zero findings. Find the vocabulary instead, and rejoin whatever sits on each side.
const VERDICT = /^(clean|cleaned|flagged)$/i;

function splitOnVerdict(cells) {
  const at = cells.findIndex((cell, index) => index >= 1 && VERDICT.test(cell));
  if (at === -1) return null;
  return {
    file: cells.slice(0, at).join('|'),
    verdict: cells[at],
    reason: cells.slice(at + 1).join('|'),
  };
}

function flaggedRow(row) {
  const file = clip(row.file);
  const { reason } = row;
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
    if (!cells) continue;
    const parsed = splitOnVerdict(cells);
    if (!parsed || !/^flagged$/i.test(parsed.verdict)) continue;
    const row = flaggedRow(parsed);
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
