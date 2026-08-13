// standup/gather.mjs — deterministic, read-only recap collector.
//
// Pure core: given a repo root, returns a structured StandupRecap built from
// LOCAL git state, .releaserc.json release rules, and the memory files. No clock
// is read in the core (the `now` parameter is accepted but never consulted) and
// no network call is made, so identical inputs always produce identical output.
//
// `remote: true` opts into collectRemoteFreshness, the one path that leaves the
// machine. It sits deliberately OUTSIDE the determinism guarantee — its answer
// depends on a remote that can move between two otherwise identical runs — which
// is why it is opt-in rather than default: memory_session_start calls gatherSync
// on every session start and must not pay a round-trip.
//
// Layering: gather() (orchestration) composes the Domain collectors, which
// compose Foundation primitives (git exec, file read, commit classifier, bump
// lattice, semver compare). git is invoked for real; failures degrade rather
// than throw.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveCategory } from '../memory-index/lift-fields.mjs';
import { parseRoadmap, Status } from '../roadmap/parse.mjs';

// ---- Orchestration -----------------------------------------------------

export function gatherSync({ rootDir, now, remote = false } = {}) {
  void now; // accepted for caller symmetry; never read — keeps the core clock-free.
  const degraded = [];
  const release = collectRelease(rootDir, degraded, remote === true);
  const releaseModel = collectReleaseModel(rootDir, degraded);
  const backlog = collectBacklog(rootDir, degraded);
  const pendingQuestions = collectPendingQuestions(rootDir, degraded);
  const roadmap = collectRoadmap(rootDir, degraded);
  return { release, releaseModel, backlog, pendingQuestions, roadmap, degraded };
}

// Async façade for callers that await (the CLI, tests, on-demand /standup).
// The synchronous core serves the sync session-start hook without rippling
// an async signature through buildIndex (and its tests).
export async function gather(opts = {}) {
  return gatherSync(opts);
}

// ---- Domain: release model (policy) ------------------------------------
// The declared release POLICY (project.json → release), distinct from the release
// MECHANISM in collectRelease (git tags + .releaserc rules). Lenient read, same
// discipline as the roadmap plan's path resolution: any absence — no config, no
// `release` key, malformed json — yields null + a `no-release-model` degraded
// marker, never a throw. The regime-aware
// recommendation is reasoned in main context (/standup SKILL, Article II); this only
// surfaces the config.
export function collectReleaseModel(rootDir, degraded) {
  const raw = readFileSafe(join(rootDir, '.claude/project.json'));
  if (raw) {
    try {
      const release = JSON.parse(raw).release;
      if (release && typeof release === 'object') return release;
    } catch {
      /* fall through to degraded */
    }
  }
  degraded.push('no-release-model');
  return null;
}

// ---- Domain: release ---------------------------------------------------

function collectRelease(rootDir, degraded, probeRemote) {
  if (!isGitRepo(rootDir)) {
    degraded.push('no-git');
    return emptyRelease();
  }
  const lastTag = gitOut(rootDir, ['describe', '--tags', '--abbrev=0']);
  if (lastTag === null) degraded.push('no-tags');

  const rules = loadReleaseRules(rootDir);
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const log = gitOut(rootDir, ['log', range, '--format=%H%x09%s']);
  const commitsSinceTag = (log ? log.split('\n').filter(Boolean) : []).map((line) =>
    describeCommit(line, rules),
  );

  return {
    lastVersion: readLastVersion(rootDir, lastTag),
    lastTag,
    commitsSinceTag,
    aggregateBump: aggregateBump(commitsSinceTag.map((c) => c.bump)),
    upstream: collectUpstream(rootDir),
    remote: probeRemote ? collectRemoteFreshness(rootDir, degraded, lastTag) : null,
  };
}

function describeCommit(line, rules) {
  const [sha, subject] = splitOnTab(line);
  const parsed = classifyCommit(subject);
  return { sha, type: parsed.type, scope: parsed.scope, subject, bump: bumpForCommit(parsed, rules) };
}

function collectUpstream(rootDir) {
  const out = gitOut(rootDir, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
  if (out === null) return noUpstream();
  const [behind, ahead] = out.split(/\s+/).map((n) => Number(n) || 0);
  let state = 'up-to-date';
  if (ahead > 0) state = 'ahead';
  else if (behind > 0) state = 'behind';
  return { state, ahead, behind };
}

function noUpstream() {
  return { state: 'no-upstream', ahead: 0, behind: 0 };
}

// ---- Domain: remote freshness (opt-in) ---------------------------------
// The only path in this module that touches the network, and it runs solely when
// the caller passes `remote: true`. Everything else answers from local refs,
// which is what lets the session-start hook call gatherSync without paying a
// round-trip. A probe that cannot run reports `remote-probe-failed` and leaves
// the local answer intact: "I could not check" must never render as "you are
// current", and it must never render as "you are stale" either.
export function collectRemoteFreshness(rootDir, degraded, localTag) {
  const advertisedTags = probeGit(rootDir, ['ls-remote', '--tags', DEFAULT_REMOTE]);
  if (advertisedTags === null) return probeFailed(degraded, 'remote-unreachable');

  const newestTag = newestSemverTag(advertisedTags);
  const head = compareHead(rootDir);
  const stale = isTagStale(localTag, newestTag) || head.state === 'diverged';

  if (stale) degraded.push('stale-remote-refs');
  if (head.state === 'unreachable') degraded.push('remote-probe-failed');

  return {
    probed: true,
    stale,
    remoteTag: newestTag ? newestTag.name : null,
    remoteHead: head.sha,
    headState: head.state,
    reason: head.state === 'unreachable' ? 'head-unreachable' : null,
  };
}

function probeFailed(degraded, reason) {
  degraded.push('remote-probe-failed');
  return { probed: true, stale: false, remoteTag: null, remoteHead: null, headState: 'unreachable', reason };
}

// Four outcomes, and collapsing any two of them is the bug this whole spec
// exists to fix. An earlier draft returned `{sha, unreachable}`, where `sha:
// null` meant BOTH "compared and equal" and "there was nothing to compare" —
// so a branch that had never been pushed rendered as `local refs match origin`,
// a verification claim for a comparison that never ran.
//
// `not-comparable` is deliberately neither stale nor a probe failure: nothing
// broke and nothing was found, there is simply no remote-tracking branch on the
// other side. `unreachable` is the opposite claim — the branch IS comparable and
// the probe itself failed — so the two must never share a value.
function compareHead(rootDir) {
  const branch = currentBranch(rootDir);
  if (branch === null) return notComparable();

  const advertised = probeGit(rootDir, ['ls-remote', '--heads', DEFAULT_REMOTE, branch]);
  if (advertised === null) return { state: 'unreachable', sha: null };

  // An empty advertisement is a successful probe of a branch the remote does not
  // carry, which is nothing to compare rather than a failure to reach.
  const remoteSha = firstSha(advertised);
  const trackedSha = gitOut(rootDir, ['rev-parse', '@{upstream}']);
  if (remoteSha === null || trackedSha === null) return notComparable();

  if (remoteSha === trackedSha) return { state: 'matched', sha: null };
  return { state: 'diverged', sha: remoteSha };
}

function notComparable() {
  return { state: 'not-comparable', sha: null };
}

// An unparseable local tag is deliberately NOT stale: the comparison cannot be
// made, and guessing would report a project with a non-semver tagging scheme as
// permanently behind. A local tree with no tags at all is a different case — a
// remote release exists that this clone has never seen, which is provable.
function isTagStale(localTag, newestTag) {
  if (!newestTag) return false;
  if (localTag === null) return true;
  const local = parseSemverTag(localTag);
  return local === null ? false : compareVersions(newestTag.version, local) > 0;
}

function emptyRelease() {
  return {
    lastVersion: null,
    lastTag: null,
    commitsSinceTag: [],
    aggregateBump: 'none',
    upstream: noUpstream(),
    remote: null,
  };
}

// ---- Domain: backlog ---------------------------------------------------

function collectBacklog(rootDir, degraded) {
  const { entries: facts, source, degraded: shapeDegraded } = resolveCategory(
    join(rootDir, '.claude/memory'), 'backlog');
  if (source === 'absent') {
    degraded.push('no-backlog');
    return { open: [], pickedUp: [], dropped: [] };
  }
  degraded.push(...shapeDegraded);
  const entries = facts.map((fact) => ({
    key: fact.key,
    status: fact.fields.status,
    parent: fact.fields.parent,
    children: [],
  }));
  nestChildren(entries);
  return bucketByStatus(entries);
}

function nestChildren(entries) {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const entry of entries) {
    if (entry.parent && byKey.has(entry.parent)) byKey.get(entry.parent).children.push(entry);
  }
}

function bucketByStatus(entries) {
  const buckets = { open: [], pickedUp: [], dropped: [] };
  const lane = { open: 'open', 'picked-up': 'pickedUp', dropped: 'dropped' };
  for (const entry of entries) {
    const target = lane[entry.status];
    if (target) buckets[target].push(entry);
  }
  return buckets;
}

// ---- Domain: pending questions -----------------------------------------

function collectPendingQuestions(rootDir, degraded) {
  const { entries, source, degraded: shapeDegraded } = resolveCategory(
    join(rootDir, '.claude/memory'), 'pending-questions');
  if (source === 'absent') {
    degraded.push('no-pending-questions');
    return [];
  }
  degraded.push(...shapeDegraded);
  return entries
    .filter((entry) => /Q-\d+/.test(entry.key))
    .map(describeQuestion);
}

const QUESTION_LABEL = 'Question';
const BLOCKER_LABEL = 'Blocker(?:\\s+for)?';

function describeQuestion(entry) {
  const body = withoutEmphasis(entry.body);
  return {
    id: entry.key,
    question: labelledField(body, QUESTION_LABEL),
    blocker: labelledField(body, BLOCKER_LABEL),
  };
}

// ---- Domain: roadmap execution plan ------------------------------------

// Delegates the actual read + parse to roadmap/parse.mjs (the typed, row-tally
// front door) and projects its RoadmapPlan into the recap's OWN shape: `tasks`
// here is the {done,inProgress,planned} tally object, where parse.mjs calls that
// `tally` and uses `tasks` for the row array. The two must not be conflated —
// rows reach the recap under `openTasks` instead. Epic status keeps the recap's
// own hyphenated spelling ('in-progress') rather than parse.mjs's Status enum
// spelling ('in_progress'). Fail-soft — a missing plan degrades, never throws.
function collectRoadmap(rootDir, degraded) {
  const plan = parseRoadmap(rootDir);
  if (plan === null) {
    degraded.push('no-roadmap-plan');
    return null;
  }
  const epics = plan.epics.map((epic) => ({
    num: epic.num,
    title: epic.title,
    tag: epic.tag,
    status: recapStatus(epic.status),
    tasks: epic.tally,
    openTasks: openRowsOf(epic),
  }));
  return { epics, progress: plan.progress };
}

// The rows land on their OWN key: `tasks` is the tally object, and
// standup-roadmap-parity.test.mjs:57 exists to keep the row array out of it.
// Done rows are dropped here rather than at render time — they are the bulk of a
// finished epic and carry no pickup signal, so nothing downstream wants them.
const OPEN_STATUSES = new Set([Status.PLANNED, Status.IN_PROGRESS]);

function openRowsOf(epic) {
  return epic.tasks
    .filter((row) => OPEN_STATUSES.has(row.status))
    .map((row) => ({ id: row.id, status: recapStatus(row.status), title: row.title }));
}

// parse.mjs's Status enum spells the in-progress state with an underscore
// ('in_progress'); the recap has always spelled it with a hyphen
// ('in-progress'). Every other status spelling ('done', 'planned', 'unknown')
// is shared verbatim between the two, so only that one state needs mapping.
function recapStatus(status) {
  return status === 'in_progress' ? 'in-progress' : status;
}

// ---- Foundation: release rules + commit classification -----------------

function loadReleaseRules(rootDir) {
  const raw = readFileSafe(join(rootDir, '.releaserc.json'));
  if (!raw) return [];
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return [];
  }
  for (const plugin of cfg.plugins || []) {
    if (Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer') {
      return (plugin[1] && plugin[1].releaseRules) || [];
    }
  }
  return [];
}

function classifyCommit(subject) {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:/.exec(subject || '');
  if (!m) return { type: null, scope: null, breaking: false };
  return { type: m[1], scope: m[2] || null, breaking: Boolean(m[3]) };
}

function bumpForCommit(parsed, rules) {
  for (const rule of rules) {
    if (ruleMatches(rule, parsed)) return normalizeRelease(rule.release);
  }
  if (parsed.breaking) return 'minor';
  if (parsed.type === 'feat') return 'minor';
  if (parsed.type === 'fix') return 'patch';
  return 'none';
}

function ruleMatches(rule, parsed) {
  const conditions = ['type', 'scope', 'breaking'].filter((k) => rule[k] !== undefined);
  if (conditions.length === 0) return false;
  if (rule.type !== undefined && rule.type !== parsed.type) return false;
  if (rule.scope !== undefined && rule.scope !== parsed.scope) return false;
  if (rule.breaking !== undefined && Boolean(rule.breaking) !== parsed.breaking) return false;
  return true;
}

const BUMP_ORDER = ['none', 'patch', 'minor', 'major'];

function normalizeRelease(release) {
  if (release === false) return 'none';
  return BUMP_ORDER.includes(release) ? release : 'none';
}

function aggregateBump(bumps) {
  return bumps.reduce((acc, b) => (BUMP_ORDER.indexOf(b) > BUMP_ORDER.indexOf(acc) ? b : acc), 'none');
}

function readLastVersion(rootDir, lastTag) {
  const raw = readFileSafe(join(rootDir, 'CHANGELOG.md'));
  const m = raw && /\[?(\d+\.\d+\.\d+)\]?/.exec(raw);
  if (m) return m[1];
  return lastTag ? lastTag.replace(/^v/, '') : null;
}

// ---- Foundation: git + file + parsing primitives -----------------------

function isGitRepo(rootDir) {
  return gitOut(rootDir, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

function gitOut(rootDir, args) {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const DEFAULT_REMOTE = 'origin';

// Measured, not guessed: five `git ls-remote --tags origin` runs against this
// repo's GitHub remote took 3.5s / 7.0s / 6.8s / 12.3s / 12.9s — TLS and auth
// setup dominate and a cold connection routinely passes ten seconds. A 10s bound
// reported `remote-probe-failed` for a perfectly healthy remote on roughly half
// the runs, which is worse than not probing: a false "could not check" trains the
// reader to ignore the marker. 30s keeps the hang bounded with real headroom.
const PROBE_TIMEOUT_MS = 30_000;

// Separate from gitOut because a network call needs a bound and a local ref read
// does not. killSignal is SIGKILL rather than the SIGTERM default: Node's docs
// state execFileSync waits for the child even after the timeout fires, so a git
// blocked on a TCP connect that ignores SIGTERM would hang the recap forever —
// which is exactly the fail-open promise this probe makes. SIGKILL is not
// catchable, so the timeout is a real bound.
//
// `shell` is left at its default false and args are passed as an array. That is
// what keeps remote-controlled ref names out of a command line: a hostile remote
// advertising `refs/tags/v0.0.9;>/tmp/x` hands us a string to parse, never argv.
function probeGit(rootDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: PROBE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    }).trim();
  } catch {
    return null;
  }
}

function currentBranch(rootDir) {
  const branch = gitOut(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch === null || branch === 'HEAD' ? null : branch;
}

function firstSha(lsRemoteOut) {
  const [sha] = splitOnTab(lsRemoteOut.split('\n')[0] ?? '');
  return sha || null;
}

const TAG_REF_PREFIX = 'refs/tags/';
const SEMVER_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;

// `^{}` marks the peeled commit an annotated tag points at, so ls-remote
// advertises every annotated tag twice. Stripping the suffix collapses the pair
// onto one name rather than letting `v2.0.0^{}` through as a separate ref.
function tagNameFrom(line) {
  const marker = line.indexOf(TAG_REF_PREFIX);
  if (marker === -1) return null;
  return line.slice(marker + TAG_REF_PREFIX.length).replace(/\^\{\}$/, '');
}

function parseSemverTag(name) {
  const m = SEMVER_TAG.exec(name);
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}

function compareVersions(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

// The remote decides what its refs are named, so anything that does not parse as
// strict semver is discarded BEFORE it can influence the comparison. Trusting
// ls-remote's own ordering, or comparing the strings, would let a remote with a
// `refs/tags/zzz` nominate our newest release — and would rank v9.0.0 above
// v10.0.0 into the bargain.
function newestSemverTag(lsRemoteOut) {
  let newest = null;
  for (const line of lsRemoteOut.split('\n')) {
    const name = tagNameFrom(line);
    const version = name === null ? null : parseSemverTag(name);
    if (version === null) continue;
    if (newest === null || compareVersions(version, newest.version) > 0) newest = { name, version };
  }
  return newest;
}

function readFileSafe(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function splitOnTab(line) {
  const i = line.indexOf('\t');
  return i === -1 ? [line, ''] : [line.slice(0, i), line.slice(i + 1)];
}

// Emphasis is stripped BEFORE matching rather than spelled into the pattern.
// Shards write `- **Question.**` with the period inside the bold, and the
// original pattern demanded a bare `Question:` — so every shipped entry parsed
// to an empty string while the regex itself looked correct. Enumerating the bold
// variants inline would leave the same trap for the next spelling; removing the
// markers first means one pattern covers all of them.
function withoutEmphasis(text) {
  return String(text ?? '').replace(/\*\*|__/g, '');
}

// The bullet and its trailing space are ONE optional unit, which is what keeps
// this linear. Spelling it `\s*[-*]?\s*` puts two unbounded whitespace runs next
// to each other separated by an optional token: on a line of leading whitespace
// that never reaches the label, every split the first run picks makes the second
// run retry every remaining length. That measured 2563ms at 32k spaces against
// 0.3ms here, and gatherSync runs on every session start.
function labelledField(body, labelPattern) {
  const m = new RegExp(`^\\s*(?:[-*]\\s*)?${labelPattern}\\s*[.:]\\s*(.+)$`, 'm').exec(body);
  return m ? m[1].trim() : '';
}

// ---- CLI wrapper -------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootFlag = process.argv.indexOf('--root');
  const rootDir = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();
  const recap = await gather({ rootDir });
  process.stdout.write(`${JSON.stringify(recap, null, 2)}\n`);
}
