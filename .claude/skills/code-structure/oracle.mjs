// code-structure oracle (code-review phase) — D6 GATING, not advisory. Mechanically
// decidable structure violations (a file over the ~80 substantive-line budget; an
// orchestration file reaching for a raw primitive) emit GROUNDED, BLOCKER-capable
// findings. Judgment-dependent readability is not decided here — the ralph-loop
// escalates an ungrounded code-structure finding to the human reviewer (D6). Read-only.

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';
import { clip } from '../lib/terminal-text.mjs';

// tier-dial:read-path — this checker's mandatory/floor come from
// resolveCheckerThreshold('code-structure') (D6/D8).
const CHECKER = 'code-structure';
export const phase = 'code-review';
const LINE_BUDGET = 80;
// Derived, not chosen: 370 files measured at p95 0.452 and p99 0.784 with the module
// header excluded (docs/research/skill-character-doctrine.md). 0.50 flags 11 of them.
const COMMENT_RATIO_MAX = 0.5;

function isCommentLine(raw) {
  const t = raw.trim();
  return t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*');
}

export function substantiveLineCount(content) {
  return String(content == null ? '' : content)
    .split(/\r?\n/)
    .filter((raw) => {
      const t = raw.trim();
      return t && !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .length;
}

// Counts comment lines AFTER the leading header block. The module header is a
// sanctioned carve-out, so counting it would fire hardest on the smallest, most
// disciplined files — the median file measures 0.244 with it and 0.098 without.
export function bodyCommentCount(content) {
  let count = 0;
  let inHeader = true;
  for (const raw of String(content == null ? '' : content).split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('#!')) continue;
    if (isCommentLine(raw)) {
      if (!inHeader) count += 1;
      continue;
    }
    inHeader = false;
  }
  return count;
}

export function runCodeStructureOracle({ changedFiles } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  for (const file of Array.isArray(changedFiles) ? changedFiles : []) {
    const lines = substantiveLineCount(file && file.content);
    const named = clip(file && file.path);
    if (lines > LINE_BUDGET) {
      findings.push(normalizeFinding({
        check: 'file_length',
        file: named,
        line: null,
        evidence: `${lines} substantive lines (> ${LINE_BUDGET})`,
        message: `${named} has ${lines} substantive lines; split along layer lines (code-structure).`,
        suggested_fix: 'Extract sub-modules following the Orchestration / Domain / Foundation model.',
        artifact: { kind: 'file-length', file: named, lines },
      }, { mandatory: mandatory && !isInheritedDebt(file) }));
    }
    const ratioFinding = commentRatioFinding(file, lines, named);
    if (ratioFinding) findings.push(ratioFinding);
  }
  return { findings };
}

// A file already over budget at HEAD carries debt this change did not create, so the
// finding is named on every touch and blocks nothing. 93 of 300 baseline-owned files
// are over the budget; blocking on inherited length would freeze a third of the tree.
// `prior` is null for a file this change created — that length is the change's own.
function isInheritedDebt(file) {
  const prior = file && file.prior;
  return typeof prior === 'string' && substantiveLineCount(prior) > LINE_BUDGET;
}

// mandatory is FORCED false, not read from the dial: D-2 lands this advisory for one
// release so the first real measurement is free. A dial change must not promote it.
function commentRatioFinding(file, substantive, named) {
  if (substantive === 0) return null;
  const comments = bodyCommentCount(file && file.content);
  const ratio = comments / substantive;
  if (ratio <= COMMENT_RATIO_MAX) return null;
  return normalizeFinding({
    check: 'comment_ratio',
    file: named,
    line: null,
    evidence: `${comments} body comment lines / ${substantive} substantive = ${ratio.toFixed(2)} (> ${COMMENT_RATIO_MAX.toFixed(2)})`,
    message: `${named} carries ${ratio.toFixed(2)} body comments per substantive line; the bar is ${COMMENT_RATIO_MAX.toFixed(2)}.`,
    suggested_fix: 'Delete what the code already says. A comment earns its line by saying why, never what.',
    artifact: { kind: 'comment-ratio', file: named, ratio },
  }, { mandatory: false });
}
