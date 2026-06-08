// standup/gather.mjs — deterministic, read-only recap collector.
//
// Pure core: given a repo root, returns a structured StandupRecap built from
// git state, .releaserc.json release rules, and the memory files. No clock is
// read in the core (the `now` parameter is accepted but never consulted), so
// identical inputs always produce identical output.
//
// Layering: gather() (orchestration) composes the three Domain collectors,
// which compose Foundation primitives (git exec, file read, commit classifier,
// bump lattice). git is invoked for real; failures degrade rather than throw.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---- Orchestration -----------------------------------------------------

export function gatherSync({ rootDir, now } = {}) {
  void now; // accepted for caller symmetry; never read — keeps the core clock-free.
  const degraded = [];
  const release = collectRelease(rootDir, degraded);
  const backlog = collectBacklog(rootDir, degraded);
  const pendingQuestions = collectPendingQuestions(rootDir, degraded);
  return { release, backlog, pendingQuestions, degraded };
}

// Async façade for callers that await (the CLI, tests, on-demand /standup).
// The synchronous core serves the sync session-start hook without rippling
// an async signature through buildIndex (and its tests).
export async function gather(opts = {}) {
  return gatherSync(opts);
}

// ---- Domain: release ---------------------------------------------------

function collectRelease(rootDir, degraded) {
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

function emptyRelease() {
  return {
    lastVersion: null,
    lastTag: null,
    commitsSinceTag: [],
    aggregateBump: 'none',
    upstream: noUpstream(),
  };
}

// ---- Domain: backlog ---------------------------------------------------

function collectBacklog(rootDir, degraded) {
  const raw = readFileSafe(join(rootDir, '.claude/memory/backlog.md'));
  if (raw === null) {
    degraded.push('no-backlog');
    return { open: [], pickedUp: [], dropped: [] };
  }
  const entries = parseEntries(raw).map(({ key, block }) => ({
    key,
    status: field(block, /^-?\s*status:\s*(\S+)/m),
    parent: field(block, /^-?\s*parent:\s*(\S+)/m),
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
  const raw = readFileSafe(join(rootDir, '.claude/memory/pending-questions.md'));
  if (raw === null) {
    degraded.push('no-pending-questions');
    return [];
  }
  return parseEntries(raw)
    .filter(({ key }) => /^Q-\d+/.test(key))
    .map(({ key, block }) => ({
      id: key,
      question: (field(block, /^-?\s*Question:\s*(.+)$/m) || '').trim(),
      blocker: (field(block, /^-?\s*Blocker(?: for)?:\s*(.+)$/m) || '').trim(),
    }));
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

function parseEntries(raw) {
  return raw
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => ({ key: block.split('\n', 1)[0].trim(), block }));
}

function field(text, re) {
  const m = re.exec(text);
  return m ? m[1] : null;
}

// ---- CLI wrapper -------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootFlag = process.argv.indexOf('--root');
  const rootDir = rootFlag !== -1 ? process.argv[rootFlag + 1] : process.cwd();
  const recap = await gather({ rootDir });
  process.stdout.write(`${JSON.stringify(recap, null, 2)}\n`);
}
