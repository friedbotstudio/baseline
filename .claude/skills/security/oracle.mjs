// security-review oracle (code-review phase) — reads the /security phase's Markdown
// report and emits a grounded finding per Critical/High. Read-only; never throws.
// Mirrors spec-rollout-enforceability-review/oracle.mjs: a finding BLOCKs only with a
// concrete artifact AND a mandatory checker (normalizeFinding + the tier dial).

import { normalizeFinding } from '../spec-diagram-review/oracle.mjs';
import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

const CHECKER = 'security';
export const phase = 'code-review';

const SEVERITY_RE = /^###\s+\[(CRITICAL|HIGH)\]\s+(.+)$/gim;

export function runSecurityOracle({ securityReport } = {}, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];
  const text = String(securityReport == null ? '' : securityReport);
  for (const m of text.matchAll(SEVERITY_RE)) {
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
