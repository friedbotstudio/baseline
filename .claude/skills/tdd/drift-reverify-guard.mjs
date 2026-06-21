// Foundation: lets the tdd drift-check-tick skip the model's drift-report
// re-interpretation when the working tree is provably unchanged since the
// verify-tick binding PASS (velocity Component 2). Mirrors simplify/reverify-guard
// and REUSES its proven fingerprint primitives (Article VI.6 reuse-before-create;
// 2nd use, so no shared-lib extraction per YAGNI). Fail-safe by construction: a
// positive provably-unchanged match yields exit 3 (skip); any doubt — missing
// snapshot, any difference, error — yields exit 0 (re-verify). The mechanical
// drift_check.mjs oracle still runs and still gates on real drift; the skip
// suppresses only the model's re-reading of a CLEAN result.

import { computeFingerprint, collectTreeState } from '../simplify/reverify-guard.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { computeFingerprint, collectTreeState };

const SKIP = { changed: false, verdict: 'skip', exitCode: 3 };
const REVERIFY = { changed: true, verdict: 're-verify', exitCode: 0 };

export function decideVerdict(storedFp, currentFp) {
  return storedFp === currentFp ? { ...SKIP } : { ...REVERIFY };
}

export function main(argv, deps = {}) {
  const [sub, slug] = argv;
  const rootDir = deps.rootDir || process.cwd();
  const stateDir = deps.stateDir || path.join(rootDir, '.claude/state/tdd');
  const treeState = deps.treeState || (() => collectTreeState(rootDir));
  if (!slug) return REVERIFY.exitCode;

  const fpPath = path.join(stateDir, `${slug}.driftfp`);

  if (sub === 'capture') {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(fpPath, computeFingerprint(treeState()));
    return 0;
  }
  if (sub === 'check') {
    if (!existsSync(fpPath)) return REVERIFY.exitCode;
    let stored;
    try {
      stored = readFileSync(fpPath, 'utf8');
    } catch {
      return REVERIFY.exitCode;
    }
    const v = decideVerdict(stored, computeFingerprint(treeState()));
    process.stdout.write(`${JSON.stringify({ changed: v.changed, verdict: v.verdict })}\n`);
    return v.exitCode;
  }
  return REVERIFY.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
