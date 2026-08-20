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
// The element type is `{path, content, prior}` and `assertChangedFilesShape`
// is the one export on this path that throws. Giving the input an owner was
// not enough on its own: the owner emitted bare path strings while
// `code-structure` and `backlog-deferral` read `file.content` and `file.path`,
// so both stayed vacuous with no error and no skip marker. Every other function
// here is fail-open by contract, which is exactly why that was silent.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

export function assertChangedFilesShape(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError(`ctx.changedFiles must be an array of {path, content, prior}; got ${typeof changedFiles}`);
  }
  changedFiles.forEach((file, index) => {
    if (file === null || typeof file !== 'object') {
      throw new TypeError(
        `ctx.changedFiles[${index}] must be a {path, content, prior} object; got ${typeof file}`,
      );
    }
    for (const field of ['path', 'content']) {
      if (typeof file[field] !== 'string') {
        throw new TypeError(
          `ctx.changedFiles[${index}].${field} must be a string; got ${typeof file[field]}`,
        );
      }
    }
    if (file.prior !== null && typeof file.prior !== 'string') {
      throw new TypeError(
        `ctx.changedFiles[${index}].prior must be a string or null; got ${typeof file.prior}`,
      );
    }
  });
}

export function assembleContext({ rootDir, exec = gitExec, readFile = readFileSync } = {}) {
  const changedFiles = assembleChangedFiles({ rootDir, exec })
    .map((path) => hydrateChangedFile(rootDir, path, { exec, readFile }))
    .filter(Boolean);
  return { changedFiles, inputState: describeInputState(changedFiles) };
}

function gitExec(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], { encoding: 'utf8' });
}
