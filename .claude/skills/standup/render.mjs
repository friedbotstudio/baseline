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
    return [...lines, ...modelLine(releaseModel), ''];
  }

  lines.push(`Unreleased: ${commits.length} commit(s)`);
  for (const [type, count] of countByType(commits)) lines.push(`  ${type}: ${count}`);
  lines.push(`Next bump: ${aggregateBump(commits)}`);
  return [...lines, ...modelLine(releaseModel), ''];
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

function epicLine(epic) {
  const tallies = Object.entries(epic.tasks ?? {})
    .map(([state, n]) => `${state} ${n}`)
    .join(', ');
  return `  ${epic.status ?? '?'} Epic ${epic.number}: ${epic.title}${tallies ? ` — ${tallies}` : ''}`;
}

function backlogLines(backlog) {
  if (!backlog) return [];
  const lines = ['## Backlog', ''];
  for (const bucket of ['open', 'picked-up', 'dropped']) {
    lines.push(`  ${bucket}: ${(backlog[bucket] ?? []).length}`);
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
