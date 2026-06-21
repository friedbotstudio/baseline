// Foundation: a deterministic fingerprint of the working tree vs HEAD, so /simplify
// can skip its Step-5 re-verify when its cleanup changed nothing (Lever 4b-ii).
// Fail-safe by construction: only a positive provably-unchanged match yields the
// skip signal (exit 3); any doubt — missing snapshot, error, unknown command —
// yields re-verify (exit 0). Skipping verification is sound only when the tree is
// provably identical to the binding-PASS state.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = { changed: false, verdict: 'skip', exitCode: 3 };
const REVERIFY = { changed: true, verdict: 're-verify', exitCode: 0 };

export function hashContent(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function computeFingerprint({ diff, untracked }) {
  const lines = [...untracked]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((u) => `${u.path}:${u.sha256}`);
  return hashContent(`${diff}\n--untracked--\n${lines.join('\n')}`);
}

export function decideVerdict(storedFp, currentFp) {
  return storedFp === currentFp ? { ...SKIP } : { ...REVERIFY };
}

export function collectTreeState(rootDir, deps = {}) {
  const exec = deps.exec || ((cmd, args) =>
    execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const readFile = deps.readFile || ((p) => readFileSync(p));
  const diff = exec('git', ['diff', 'HEAD']);
  const untracked = exec('git', ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .map((rel) => ({ path: rel, sha256: hashContent(readFile(path.join(rootDir, rel))) }));
  return { diff, untracked };
}

export function main(argv, deps = {}) {
  const [sub, slug] = argv;
  const rootDir = deps.rootDir || process.cwd();
  const stateDir = deps.stateDir || path.join(rootDir, '.claude/state/simplify');
  const treeState = deps.treeState || (() => collectTreeState(rootDir));
  if (!slug) return REVERIFY.exitCode;

  const fpPath = path.join(stateDir, `${slug}.fp`);

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
