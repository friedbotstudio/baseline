// Foundation — StandupRecap to display lines.
//
// The reduction is the point, and a threshold is how it survives contact with a
// reader. gatherSync returns every commit since the last tag as a full object; a
// renderer that prints them all back reproduces the cost the CLI exists to
// remove. But collapsing at EVERY size cost the reader a second `--json` pass to
// answer "what is actually in this pile?" for a four-commit pile. So detail
// renders below the bound and degrades to counts above it: the 70-commit case
// that motivated the reduction still collapses, and the everyday case answers
// itself.
//
// Nothing here reads the filesystem, git, or the clock — the same recap always
// renders the same lines.

import { clip } from '../lib/terminal-text.mjs';

const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const RANK_BUMP = ['none', 'patch', 'minor', 'major'];

const COMMIT_DETAIL_MAX = 20;
const OPEN_TASK_DETAIL_MAX = 20;

export function renderRecap(recap) {
  if (recap === null || typeof recap !== 'object' || Array.isArray(recap)) {
    throw new TypeError('renderRecap expects a StandupRecap object');
  }
  return [
    ...releaseLines(recap.release, recap.releaseModel),
    ...roadmapLines(recap.roadmap),
    ...backlogLines(recap.backlog),
    ...questionLines(recap.pendingQuestions),
    ...degradedLines(recap.degraded),
  ];
}

function releaseLines(release, releaseModel) {
  return [
    '## Release',
    '',
    `Shipped: ${release?.lastVersion ?? '(never released)'}`,
    ...unreleasedLines(release?.commitsSinceTag ?? []),
    ...upstreamLine(release?.upstream),
    ...freshnessLine(release),
    ...modelLine(releaseModel),
    ...gateLine(releaseModel?.completeness_gate),
    '',
  ];
}

function unreleasedLines(commits) {
  if (commits.length === 0) return ['No unreleased commits.'];
  return [
    `Unreleased: ${commits.length} commit(s)`,
    ...commitLines(commits),
    `Next bump: ${aggregateBump(commits)}`,
  ];
}

function commitLines(commits) {
  if (commits.length > COMMIT_DETAIL_MAX) {
    return countByType(commits).map(([type, count]) => `  ${type}: ${count}`);
  }
  // The type column is deliberately absent: a conventional-commit subject opens
  // with its own type, so printing it again rendered `feat  minor  feat(...)`.
  // The bump is what the subject does NOT already carry.
  return commits.map((commit) => `  ${commit.bump}  ${clip(commit.subject)}`);
}

// `no-upstream` and `up-to-date` are answers to different questions and must
// never share wording: one means nothing was compared, the other means the
// comparison ran and matched. collectRemoteFreshness draws the same line between
// `not-comparable` and `matched`, and collapsing it is what let an unpushed
// branch read as current.
function upstreamLine(upstream) {
  if (!upstream) return [];
  if (upstream.state === 'no-upstream') {
    return ['Upstream: none. This branch tracks no remote, so there is nothing to compare.'];
  }
  if (upstream.state === 'ahead') return [`Unpushed: ${upstream.ahead} commit(s) not on origin.`];
  if (upstream.state === 'behind') return [`Behind origin by ${upstream.behind} commit(s).`];
  return ['Upstream: level with the last fetched origin.'];
}

// The gate decides whether an unreleased pile may be cut at all, so it belongs
// beside the policy it qualifies rather than in the config a reader has to open.
function gateLine(gate) {
  if (!gate) return [];
  const consequence = gate.half_wired_blocks_release
    ? 'a half-wired feature blocks the release'
    : 'half-wired features do not block the release';
  return [`Completeness gate: ${gate.enabled ? 'enabled' : 'disabled'} — ${consequence}.`];
}

// Every figure above this line comes from local refs. Un-probed, that is exactly
// as stale as the last fetch, and saying nothing is what let a shipped v0.22.0
// read as a 70-commit unreleased pile. The caveat is not decoration: it is the
// half of the fix that serves a reader who does not know `--remote` exists.
function freshnessLine(release) {
  const remote = release?.remote ?? null;
  if (remote === null) {
    return ['Figures read local refs, not fetched. Run `git fetch --tags` to confirm.'];
  }
  if (remote.stale) {
    return [`Remote check: origin is AHEAD${remote.remoteTag ? ` at ${remote.remoteTag}` : ''}. Run \`${fetchRemedy(remote)}\`.`];
  }
  if (remote.reason) {
    return [`Remote check failed (${remote.reason}). Figures read local refs, not fetched.`];
  }
  if (remote.headState === 'not-comparable') {
    return ['Remote check: tags only. This checkout has no upstream branch, so its head was not compared.'];
  }
  return ['Remote check: local refs match origin.'];
}

// Naming `--tags` when no tag drove the finding points the reader at an object
// their repository does not have. A head-only staleness on a tagless repo is
// fixed by a plain fetch.
function fetchRemedy(remote) {
  return remote.remoteTag ? 'git fetch --tags' : 'git fetch';
}

function modelLine(releaseModel) {
  if (!releaseModel) return [];
  const parts = ['release_trigger', 'release_cycle', 'consumer_upgrade_cadence']
    .filter((key) => releaseModel[key])
    .map((key) => `${key}=${releaseModel[key]}`);
  return parts.length ? [`Release model: ${parts.join(' · ')}`] : [];
}

function countByType(commits) {
  const counts = new Map();
  for (const c of commits) counts.set(c.type ?? 'other', (counts.get(c.type ?? 'other') ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function aggregateBump(commits) {
  const rank = commits.reduce((hi, c) => Math.max(hi, BUMP_RANK[c.bump] ?? 0), 0);
  return RANK_BUMP[rank];
}

function roadmapLines(roadmap) {
  if (!roadmap) return ['## Roadmap', '', 'Roadmap: not configured.', ''];

  const epics = roadmap.epics ?? [];
  const withRows = totalOpenRows(epics) <= OPEN_TASK_DETAIL_MAX;
  return [
    '## Roadmap',
    '',
    ...epics.flatMap((epic) => epicBlock(epic, withRows)),
    ...(roadmap.progress ?? []).map((bullet) => `  ${bullet}`),
    '',
  ];
}

// The budget is measured across the whole plan, not per epic: eight epics with
// four open rows each is the same wall of text as one epic with thirty-two.
function totalOpenRows(epics) {
  return epics.reduce((count, epic) => count + (epic.openTasks?.length ?? 0), 0);
}

function epicBlock(epic, withRows) {
  if (!withRows) return [epicLine(epic)];
  return [epicLine(epic), ...(epic.openTasks ?? []).map(openTaskLine)];
}

function openTaskLine(row) {
  return `    ${row.status} ${row.id}. ${clip(row.title)}`;
}

// `num`, not `number` — gather.mjs's collectRoadmap projects parse.mjs's epic
// number under that key, and reading the wrong one printed "Epic undefined" for
// every row while both sides' unit tests stayed green. `??` rather than `||`
// because epic 0 is a real epic number.
function epicLine(epic) {
  const tallies = Object.entries(epic.tasks ?? {})
    .map(([state, n]) => `${state} ${n}`)
    .join(', ');
  return `  ${epic.status ?? '?'} Epic ${epic.num ?? '?'}: ${epic.title}${tallies ? ` — ${tallies}` : ''}`;
}

// The label and the data key differ for exactly one bucket, and both spellings
// are load-bearing: gather.mjs emits `pickedUp`, while SKILL.md documents
// `picked-up` as the user-visible bucket name. Iterating the labels alone read
// `backlog['picked-up']` — a key the gatherer never emits — so that count
// rendered 0 unconditionally. Map the pair; rename neither side.
const BACKLOG_BUCKETS = [
  ['open', 'open'],
  ['picked-up', 'pickedUp'],
  ['dropped', 'dropped'],
];

function backlogLines(backlog) {
  if (!backlog) return [];
  const lines = ['## Backlog', ''];
  for (const [label, key] of BACKLOG_BUCKETS) {
    lines.push(`  ${label}: ${(backlog[key] ?? []).length}`);
  }
  return [...lines, ''];
}

function questionLines(pendingQuestions) {
  const questions = pendingQuestions ?? [];
  if (questions.length === 0) return [];
  return ['## Open questions', '', ...questions.map(questionLine), ''];
}

function questionLine(question) {
  const blocks = question.blocker ? ` (blocks: ${clip(question.blocker)})` : '';
  return `  ${question.id ?? '?'}: ${clip(question.question)}${blocks}`;
}

function degradedLines(degraded) {
  const markers = degraded ?? [];
  if (markers.length === 0) return [];
  return ['## Degraded', '', `  ${markers.join(', ')}`, ''];
}
