// Foundation — the changed-set behind the staleness witness.
//
// `git diff --name-only <stamp>..HEAD` is a pure function of (stamp, HEAD), and
// HEAD is fixed for the length of a run. Two consequences, and this module is
// both of them: the same stamp is computed once per run, and a run whose HEAD
// matches the previous run's reuses that run's answers outright.
//
// Measured on the live store at 7fd51c0 before this existed: 433 entries, 433
// spawns, 62s of session start. 119 of those entries have a verdict that reads
// the result, and they carry 8 distinct stamps.
//
// Both memory_session_start.mjs and sweep.mjs resolve through here, which is what
// keeps their two staleness verdicts equal (AC-009); tests/sweep-staleness-parity
// pins that, and it is unchanged by this work.
//
// It lives here rather than in staleness.mjs because that module is pure and
// imports no child_process. The predicate answers a question; this fetches one of
// its inputs.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { usableStamp } from './staleness.mjs';

const GIT_TIMEOUT_MS = 5000;

function defaultCachePath(rootDir) {
  return join(rootDir, '.claude', 'state', 'memory', 'changed-set-cache.json');
}

// Anything the file cannot be trusted to say lands on the same state as no file
// at all: an empty memo. There is no partial trust and no repair path, because a
// half-read cache is indistinguishable from a wrong one.
function loadMemo(cachePath, head) {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    if (parsed.head !== head) return new Map();
    if (!parsed.sets || typeof parsed.sets !== 'object' || Array.isArray(parsed.sets)) return new Map();
    return new Map(Object.entries(parsed.sets).filter(([, paths]) => Array.isArray(paths)));
  } catch {
    return new Map();
  }
}

/**
 * @param {object} opts
 * @param {string} opts.rootDir - repository root, passed to git as -C
 * @param {string} opts.head - the current HEAD, and the cache's validity key
 * @param {string} [opts.cachePath] - defaults to <rootDir>/.claude/state/memory/…
 * @param {Function} [opts.spawn] - injectable spawnSync (for tests)
 */
export function createResolver({ rootDir, head, cachePath = defaultCachePath(rootDir), spawn = spawnSync } = {}) {
  const memo = loadMemo(cachePath, head);
  let computedThisRun = false;

  // null means "could not answer", which the predicate reads as unknown and
  // resolves on the date leg. An empty array means "nothing moved". Collapsing
  // the two would report an entry fresh at any age on a comparison that never ran.
  function changedSince(stamp) {
    if (!usableStamp(stamp)) return null;
    const key = stamp.trim();
    if (memo.has(key)) return memo.get(key);

    const result = spawn('git', ['-C', rootDir, 'diff', '--name-only', `${key}..HEAD`], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    });
    if (!result || result.status !== 0) return null;

    const paths = (result.stdout || '').split('\n').filter(Boolean);
    memo.set(key, paths);
    computedThisRun = true;
    return paths;
  }

  // A warm run computes nothing and therefore writes nothing, which is what keeps
  // the file's mtime tracking the last cold run rather than the last session.
  function persist() {
    if (!computedThisRun) return;
    try {
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ head, sets: Object.fromEntries(memo) }), 'utf8');
    } catch {}
  }

  return { changedSince, persist };
}

// The two exported `isStale` predicates take a repository root as their fourth
// argument and tests/sweep-staleness-parity.test.mjs calls both that way. A caller
// holding a shared resolver passes it instead; a caller holding a root gets a
// one-off, which still memoizes within itself and still reads the cache.
export function asResolver(rootOrResolver, head) {
  if (rootOrResolver && typeof rootOrResolver.changedSince === 'function') return rootOrResolver;
  return createResolver({ rootDir: rootOrResolver, head });
}
