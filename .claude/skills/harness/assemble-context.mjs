// Foundation — the fan-out's input, built by code instead of by prose.
//
// `checker-fanout.mjs` read `ctx.changedFiles || []` and no producer existed:
// `integrate/SKILL.md` step 3.5 delegated ctx assembly to main context in a
// paragraph. Every archived `.claude/state/checker-fanout-code/*.json` reads
// `{"findings": [], "verdict": "CLEAN"}` — the code-structure and
// backlog-deferral checkers had never once run against real input, and nothing
// on the page said so.
//
// A quality gate whose input is assembled by instructions will eventually run
// with no input, and the verdict it emits will be indistinguishable from a real
// one. Both halves are fixed here: the input has an owner, and the verdict
// carries which kind of zero it means.

import { execFileSync } from 'node:child_process';

const CHANGED_FILES_ARGS = ['diff', '--name-only', 'HEAD'];

export function assembleChangedFiles({ rootDir, exec = gitExec } = {}) {
  try {
    return String(exec(rootDir, CHANGED_FILES_ARGS))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// `no-input` and a measured zero are the same empty array, so the distinction
// has to be carried alongside it. Without this, "we reviewed everything and found
// nothing" and "we reviewed nothing" render identically — which is how a blind
// gate reported CLEAN for its entire life.
export function describeInputState(changedFiles, { probeFailed = false } = {}) {
  if (probeFailed || changedFiles.length === 0) return 'no-input';
  return 'measured';
}

export function assembleContext({ rootDir, exec = gitExec } = {}) {
  const changedFiles = assembleChangedFiles({ rootDir, exec });
  return { changedFiles, inputState: describeInputState(changedFiles) };
}

function gitExec(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' });
}
