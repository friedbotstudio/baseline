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
import { resolveCategory } from '../memory-index/lift-fields.mjs';

// ---- Orchestration -----------------------------------------------------

export function gatherSync({ rootDir, now } = {}) {
  void now; // accepted for caller symmetry; never read — keeps the core clock-free.
  const degraded = [];
  const release = collectRelease(rootDir, degraded);
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
// MECHANISM in collectRelease (git tags + .releaserc rules). Lenient read mirroring
// roadmapPathFor: any absence — no config, no `release` key, malformed json — yields
// null + a `no-release-model` degraded marker, never a throw. The regime-aware
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
    .map((entry) => ({
      id: entry.key,
      question: (field(entry.body, /^-?\s*Question:\s*(.+)$/m) || '').trim(),
      blocker: (field(entry.body, /^-?\s*Blocker(?: for)?:\s*(.+)$/m) || '').trim(),
    }));
}

// ---- Domain: roadmap execution plan ------------------------------------

// Reads the project's execution roadmap (project.json → roadmap.path, default
// docs/roadmap-execution-plan.md) — the epic-by-epic delivery tracker. Returns the
// epic list (number/title/tag/status + per-task tallies) and the Progress summary
// bullets. Status is read from the heading emoji legend (✅ done · 🟡 in progress ·
// ⬜ planned); per-task tallies count the same emojis across the epic's bodies. This
// is the machine-readable signal sprint-planner reads to compute per-task readiness
// and roadmap-sync writes back to; fail-soft — a missing plan degrades, never throws.
function collectRoadmap(rootDir, degraded) {
  const raw = readFileSafe(join(rootDir, roadmapPathFor(rootDir)));
  if (raw === null) {
    degraded.push('no-roadmap-plan');
    return null;
  }
  const epics = [];
  let progress = [];
  for (const { key, block } of parseEntries(raw)) {
    const epic = parseEpicHeading(key);
    if (epic) epics.push({ ...epic, tasks: countTaskStatuses(block) });
    else if (/^Progress\b/.test(key)) progress = bulletLines(block);
  }
  return { epics, progress };
}

// project.json → roadmap.path, resolved leniently; falls back to the baseline default.
function roadmapPathFor(rootDir) {
  const raw = readFileSafe(join(rootDir, '.claude/project.json'));
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      const p = cfg && cfg.roadmap && cfg.roadmap.path;
      if (typeof p === 'string' && p.trim()) return p.trim();
    } catch {
      /* fall through to default */
    }
  }
  return 'docs/roadmap-execution-plan.md';
}

// Epic headings: `## Epic N — Title <emoji> (tag)`. The optional parenthetical is
// captured as `tag` and stripped from the title.
function parseEpicHeading(heading) {
  const m = /^Epic\s+(\d+)\s+—\s+(.+)$/.exec(heading);
  if (!m) return null;
  const rest = m[2];
  const tag = field(rest, /\(([^)]*)\)/);
  const title = rest
    .replace(/\s*(?:✅|🟡|⬜).*$/u, '')
    .replace(/\s*\(.*$/, '')
    .trim();
  return { num: Number(m[1]), title, tag: tag ? tag.trim() : null, status: statusFromEmoji(rest) };
}

function countTaskStatuses(block) {
  const body = block.slice(block.indexOf('\n') + 1); // drop the heading line (its emoji is the epic status)
  return {
    done: occurrences(body, '✅'),
    inProgress: occurrences(body, '🟡'),
    planned: occurrences(body, '⬜'),
  };
}

const STATUS_BY_EMOJI = [
  ['✅', 'done'],
  ['🟡', 'in-progress'],
  ['⬜', 'planned'],
];

function statusFromEmoji(text) {
  let best = { status: 'unknown', at: Infinity };
  for (const [emoji, status] of STATUS_BY_EMOJI) {
    const at = text.indexOf(emoji);
    if (at !== -1 && at < best.at) best = { status, at };
  }
  return best.status;
}

function occurrences(text, sub) {
  return text.split(sub).length - 1;
}

function bulletLines(block) {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/\*\*/g, '').trim());
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
