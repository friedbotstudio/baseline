// Domain — a parsed roadmap plan projected into the lines `list` prints.
//
// Two shapes come out of one projection: `buildView` returns the object the
// `--json` path emits, and `renderPlan` formats that same object into lines.
// Nothing here reads the filesystem, git, or the clock, so the same plan always
// renders the same lines.
//
// The deliberate divergence from standup's renderer: open rows never collapse to
// a count at any plan size. standup bounds them because its recap answers six
// questions and the roadmap is one of them; this command answers only that one,
// so collapsing what it exists to show would leave nothing. Finished epics are
// what collapses instead — they are the bulk, and they carry no pickup.

import { clip } from '../lib/terminal-text.mjs';
import { DONE, IN_PROGRESS, PLANNED } from '../lib/epic-heading.mjs';
import { Status } from './parse.mjs';

const EMOJI = {
  [Status.DONE]: DONE,
  [Status.IN_PROGRESS]: IN_PROGRESS,
  [Status.PLANNED]: PLANNED,
};

function isOpen(task) {
  return task.status !== Status.DONE;
}

function compressRuns(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const runs = [];
  for (const num of sorted) {
    const last = runs[runs.length - 1];
    if (last && num === last.end + 1) last.end = num;
    else runs.push({ start: num, end: num });
  }
  return runs.map((run) => (run.start === run.end ? `${run.start}` : `${run.start}-${run.end}`));
}

function totalsOf(epics) {
  return epics.reduce(
    (acc, epic) => ({
      done: acc.done + epic.tally.done,
      inProgress: acc.inProgress + epic.tally.inProgress,
      planned: acc.planned + epic.tally.planned,
    }),
    { done: 0, inProgress: 0, planned: 0 },
  );
}

function firstPlanned(epics) {
  for (const epic of epics) {
    for (const task of epic.tasks) {
      if (task.status === Status.PLANNED) {
        return { id: task.id, epicNum: epic.num, title: task.title };
      }
    }
  }
  return null;
}

export function buildView(plan, { all = false } = {}) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan) || !Array.isArray(plan.epics)) {
    throw new TypeError('buildView expects a RoadmapPlan object');
  }

  const { epics } = plan;
  const collapsed = all ? [] : epics.filter((epic) => epic.status === Status.DONE);
  const collapsedNums = new Set(collapsed.map((epic) => epic.num));

  const groups = [];
  if (collapsed.length) {
    groups.push({
      kind: 'rollup',
      epicNums: collapsed.map((epic) => epic.num),
      ranges: compressRuns(collapsed.map((epic) => epic.num)),
      rows: collapsed.reduce((sum, epic) => sum + epic.tasks.length, 0),
    });
  }
  for (const epic of epics) {
    if (collapsedNums.has(epic.num)) continue;
    groups.push({
      kind: 'epic',
      num: epic.num,
      title: epic.title,
      status: epic.status,
      tally: epic.tally,
      tasks: (all ? epic.tasks : epic.tasks.filter(isOpen)).map((task) => ({
        id: task.id,
        status: task.status,
        title: task.title,
      })),
    });
  }

  return {
    path: plan.path,
    epicCount: epics.length,
    totals: totalsOf(epics),
    groups,
    nextPlanned: firstPlanned(epics),
  };
}

function rollupLine(group) {
  const noun = group.epicNums.length === 1 ? 'Epic' : 'Epics';
  return `${DONE} ${noun} ${group.ranges.join(', ')}  (${group.rows} rows, all done)`;
}

function epicLines(group) {
  const total = group.tally.done + group.tally.inProgress + group.tally.planned;
  const header = `Epic ${group.num}  ${EMOJI[group.status] ?? PLANNED}  ${clip(group.title)}  (${group.tally.done}/${total} done)`;
  const rows = group.tasks.map((task) => `  ${EMOJI[task.status] ?? PLANNED} ${task.id}  ${clip(task.title)}`);
  return [header, ...rows, ''];
}

export function renderPlan(plan, opts = {}) {
  const view = buildView(plan, opts);
  const { done, inProgress, planned } = view.totals;
  const rows = done + inProgress + planned;

  const out = [
    `Roadmap — ${view.path}`,
    `${view.epicCount} epics · ${rows} rows · ${done} done, ${inProgress} in progress, ${planned} planned`,
    '',
  ];

  for (const group of view.groups) {
    if (group.kind === 'rollup') out.push(rollupLine(group), '');
    else out.push(...epicLines(group));
  }

  const pickup = view.nextPlanned;
  out.push(
    pickup
      ? `Next planned: Epic ${pickup.epicNum}  ${pickup.id}  ${clip(pickup.title)}`
      : 'Next planned: (none)',
  );
  return out;
}
