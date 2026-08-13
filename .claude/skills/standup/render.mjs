// Foundation — StandupRecap to display lines.
//
// The reduction is the point. gatherSync returns every commit since the last tag
// as a full object; a renderer that prints them back reproduces the cost the CLI
// exists to remove, so commits collapse to counts-by-type and the aggregate bump.
// Nothing here reads the filesystem, git, or the clock — the same recap always
// renders the same lines.

const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const RANK_BUMP = ['none', 'patch', 'minor', 'major'];

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
  const shipped = release?.lastVersion ?? '(never released)';
  const commits = release?.commitsSinceTag ?? [];
  const lines = ['## Release', '', `Shipped: ${shipped}`];

  if (commits.length === 0) {
    lines.push('No unreleased commits.');
    return [...lines, ...freshnessLine(release), ...modelLine(releaseModel), ''];
  }

  lines.push(`Unreleased: ${commits.length} commit(s)`);
  for (const [type, count] of countByType(commits)) lines.push(`  ${type}: ${count}`);
  lines.push(`Next bump: ${aggregateBump(commits)}`);
  return [...lines, ...freshnessLine(release), ...modelLine(releaseModel), ''];
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

  const lines = ['## Roadmap', ''];
  for (const epic of roadmap.epics ?? []) lines.push(epicLine(epic));
  for (const bullet of roadmap.progress ?? []) lines.push(`  ${bullet}`);
  return [...lines, ''];
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
  return ['## Open questions', '', ...questions.map((q) => `  ${q.id ?? '?'}: ${q.question ?? q.title ?? ''}`), ''];
}

function degradedLines(degraded) {
  const markers = degraded ?? [];
  if (markers.length === 0) return [];
  return ['## Degraded', '', `  ${markers.join(', ')}`, ''];
}
