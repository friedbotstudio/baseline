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
//
// The element type is `{path, content, prior}`; `changed-files-shape.mjs` holds the one
// assertion on this path that throws. Every function here is fail-open by contract.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Re-exported so `assertChangedFilesShape` keeps its import site while its body lives
// with the other type-contract code.
export { assertChangedFilesShape } from './changed-files-shape.mjs';

// Two probes, because `git diff` answers only for paths the index already knows. A file
// this change CREATED is untracked until it is staged, and under TDD that is most of the
// change — so a single-probe input let a brand-new module reach no checker at all.
//
// `-z` on both: without it git QUOTES a path containing a newline or a quote, and
// splitting that on '\n' yields fragments that fail their read and vanish with no error.
const PROBES = [
  { name: 'modified', args: ['diff', '--name-only', '-z', 'HEAD'] },
  { name: 'created', args: ['ls-files', '--others', '--exclude-standard', '-z'] },
];

export function probeChangedFiles({ rootDir, exec = gitExec } = {}) {
  const paths = [];
  const seen = new Set();
  const failedProbes = [];
  for (const probe of PROBES) {
    let out;
    try {
      out = exec(rootDir, probe.args);
    } catch {
      failedProbes.push(probe.name);
      continue;
    }
    for (const path of String(out).split('\0')) {
      if (path === '' || seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  return { paths, failedProbes };
}

// Kept as a `string[]` projection of the probe above: tests/checker-fanout.test.mjs pins
// that return type, and the richer result has exactly one reader.
export function assembleChangedFiles(options = {}) {
  return probeChangedFiles(options).paths;
}

// `no-input` and a measured zero are the same empty array, so the distinction has to be
// carried alongside it — "we reviewed everything and found nothing" and "we reviewed
// nothing" otherwise render identically, which is how a blind gate reported CLEAN for its
// entire life. A run that lost one probe and kept the other is a third case: it measured
// something, but not the whole change.
export function describeInputState(changedFiles, { probeFailed = false, failedProbes = [] } = {}) {
  const lost = probeFailed ? PROBES.length : failedProbes.length;
  if (lost >= PROBES.length || changedFiles.length === 0) return 'no-input';
  return lost > 0 ? 'partial' : 'measured';
}

// `prior` is the file's content at HEAD, or null when this change created it.
// The code-structure oracle decides severity from it and never reads a file
// itself, so the IO stays on this side of the boundary.
function hydrateChangedFile(rootDir, path, { exec, readFile }) {
  let content;
  try {
    content = String(readFile(join(rootDir, path)));
  } catch {
    return null;
  }
  let prior = null;
  try {
    prior = String(exec(rootDir, ['show', `HEAD:${path}`]));
  } catch {
    prior = null;
  }
  return { path, content, prior };
}

export function assembleContext({ rootDir, exec = gitExec, readFile = readFileSync } = {}) {
  const { paths, failedProbes } = probeChangedFiles({ rootDir, exec });
  const changedFiles = paths
    .map((path) => hydrateChangedFile(rootDir, path, { exec, readFile }))
    .filter(Boolean);
  return { changedFiles, inputState: describeInputState(changedFiles, { failedProbes }) };
}

function gitExec(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' });
}
