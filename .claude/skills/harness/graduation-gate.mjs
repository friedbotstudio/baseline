// graduation-gate — fail-CLOSED, counts-only evaluator for the seed.md §II.A
// clause-7 graduation gate. Unlike rightsize-gate (fail-OPEN), a malformed/missing
// ledger yields pass:false: the Article II amendment can never ride on bad evidence.
// pass = (>=3 governed round-trips) AND (0 false-positive blocks) AND security clean.
// No LLM judgment in the decision path — counts only.

import { join } from 'node:path';
import { readLedger } from './evidence-ledger.mjs';

const MIN_ROUND_TRIPS = 3;

export function evaluateGate({ ledger, securityClean }) {
  if (!ledger || !Array.isArray(ledger.round_trips)) {
    return { pass: false, round_trips: 0, false_positive_blocks: 0, security_clean: securityClean === true, reason: 'missing or malformed ledger (fail-closed)' };
  }
  const roundTrips = ledger.round_trips.length;
  const fpBlocks = ledger.round_trips.reduce((sum, rt) => sum + (Number(rt.false_positive_blocks) || 0), 0);
  const secClean = securityClean === true;

  const reasons = [];
  if (roundTrips < MIN_ROUND_TRIPS) reasons.push(`only ${roundTrips}/${MIN_ROUND_TRIPS} governed round-trips`);
  if (fpBlocks !== 0) reasons.push(`${fpBlocks} false-positive block(s)`);
  if (!secClean) reasons.push('security not clean');

  const pass = reasons.length === 0;
  return {
    pass,
    round_trips: roundTrips,
    false_positive_blocks: fpBlocks,
    security_clean: secClean,
    reason: pass ? 'graduation gate met' : reasons.join('; '),
  };
}

function readSecurityClean(rootDir, slug, deps) {
  if (typeof deps.securityClean === 'boolean') return deps.securityClean;
  const sentinel = join(rootDir, '.claude', 'state', slug, 'security-clean');
  return deps.existsSync ? deps.existsSync(sentinel) : false;
}

export async function main(argv, deps = {}) {
  const slug = argv[1];
  const rootDir = deps.rootDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!slug) {
    process.stdout.write(JSON.stringify({ pass: false, reason: 'usage: graduation-gate.mjs evaluate <slug>' }) + '\n');
    return;
  }
  const ledgerPath = join(rootDir, '.claude', 'state', slug, 'ledger.json');
  const read = deps.readLedger || readLedger;
  let ledger;
  try { ledger = read(ledgerPath); } catch { ledger = null; }
  const result = evaluateGate({ ledger, securityClean: readSecurityClean(rootDir, slug, deps) });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
