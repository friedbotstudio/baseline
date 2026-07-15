// code-structure oracle (code-review phase) — D6 GATING, not advisory. Mechanically
// decidable structure violations (a file over the ~80 substantive-line budget; an
// orchestration file reaching for a raw primitive) emit GROUNDED, BLOCKER-capable
// findings. Judgment-dependent readability is not decided here — the ralph-loop
// escalates an ungrounded code-structure finding to the human reviewer (D6). Read-only.

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

// tier-dial:read-path — this checker's mandatory/floor come from
// resolveCheckerThreshold('code-structure') (D6/D8).
const CHECKER = 'code-structure';
export const phase = 'code-review';
const LINE_BUDGET = 80;

function substantiveLineCount(content) {
  return String(content == null ? '' : content)
    .split(/\r?\n/)
    .filter((raw) => {
      const t = raw.trim();
      return t && !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .length;
}

export function runCodeStructureOracle({ changedFiles } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  for (const file of Array.isArray(changedFiles) ? changedFiles : []) {
    const lines = substantiveLineCount(file && file.content);
    if (lines > LINE_BUDGET) {
      findings.push(normalizeFinding({
        check: 'file_length',
        file: file.path,
        line: null,
        evidence: `${lines} substantive lines (> ${LINE_BUDGET})`,
        message: `${file.path} has ${lines} substantive lines; split along layer lines (code-structure).`,
        suggested_fix: 'Extract sub-modules following the Orchestration / Domain / Foundation model.',
        artifact: { kind: 'file-length', file: file.path, lines },
      }, { mandatory }));
    }
  }
  return { findings };
}
