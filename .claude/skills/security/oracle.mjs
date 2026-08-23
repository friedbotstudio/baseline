// security-review oracle (code-review phase) — reads the /security phase's Markdown
// report and emits a grounded finding per Critical/High. Read-only; never throws.
// Mirrors spec-rollout-enforceability-review/oracle.mjs: a finding BLOCKs only with a
// concrete artifact AND a mandatory checker (normalizeFinding + the tier dial).

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

const CHECKER = 'security';
export const phase = 'code-review';

const SEVERITY_RE = /^###\s+\[(CRITICAL|HIGH)\]\s+(.+)$/gim;

// /security names three outcomes for a Critical or High, and one of them is "fix now".
// Without a way to record that, a workflow that finds and fixes its own HIGH is blocked
// by the report saying it did. A `- **Resolved**: …` bullet inside the finding's own
// section says the finding is closed; the scope matters, because one stray note must
// never silence a sibling that is still open.
const RESOLVED_RE = /^\s*[-*]\s+\*\*Resolved\*\*\s*:/im;
const SECTION_BREAK = /^#{2,3}\s/m;

function sectionBody(text, startIndex) {
  const rest = text.slice(startIndex);
  const next = rest.search(SECTION_BREAK);
  return next === -1 ? rest : rest.slice(0, next);
}

export function runSecurityOracle({ securityReport } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  const text = String(securityReport == null ? '' : securityReport);
  for (const m of text.matchAll(SEVERITY_RE)) {
    if (RESOLVED_RE.test(sectionBody(text, m.index + m[0].length))) continue;
    findings.push(normalizeFinding({
      check: 'security_finding',
      file: null,
      line: null,
      evidence: m[2].trim(),
      message: `Security review reported a ${m[1]} finding: ${m[2].trim()}`,
      suggested_fix: 'Resolve the finding or accept the risk before landing.',
      artifact: { kind: 'security-report', severity: m[1] },
    }, { mandatory }));
  }
  return { findings };
}
