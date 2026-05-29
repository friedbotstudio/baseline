// Domain — codesign Step 1.5 decision-point finder (AC-005). Scans the
// research memo for forks (>=2 candidates with comparable tradeoffs) and
// returns a structured list of decisions for the engineer to make.
// Pure text scan; no I/O.

const CANDIDATE_RE = /^##\s+Candidate\s+[A-Z][^:]*:\s*(.+)$/gm;

export function findDecisionPoints({ researchMemo, scoutReport }) {
  const decisions = [];

  const candidates = [];
  let m;
  while ((m = CANDIDATE_RE.exec(researchMemo || '')) !== null) {
    candidates.push(m[1].trim());
  }
  CANDIDATE_RE.lastIndex = 0;

  if (candidates.length >= 2) {
    decisions.push({
      id: 'D1',
      name: 'Candidate selection',
      options_considered: candidates,
      source: 'research_memo: >=2 candidates with tradeoffs',
    });
  }

  return decisions;
}
