// Orchestration — the read front door onto the execution roadmap.
//
// Four verbs, each a thin read over `parseRoadmap`: `list` (the whole plan as a
// reader sees it — see render.mjs), `tasks` (optionally
// filtered by --epic/--status), `epics` (the epic list with tallies), and
// `next` (the first planned task in FILE ORDER — ordering the dependency
// graph is roadmap-planner's job, not this dispatcher's). A missing roadmap
// file is a NotFoundError so the shared dispatcher in lib/argv.mjs maps it to
// exit 2 uniformly with every other reader in this sweep.

import { dispatch, lines, requireValue, UsageError, NotFoundError } from '../lib/argv.mjs';
import { parseRoadmap, roadmapPathFor, Status } from './parse.mjs';
import { buildView, renderPlan } from './render.mjs';

const STATUS_VALUES = Object.values(Status);

function loadPlan(root) {
  const plan = parseRoadmap(root);
  if (!plan) {
    throw new NotFoundError(`no roadmap at ${roadmapPathFor(root)}`);
  }
  return plan;
}

function allTasks(plan) {
  return plan.epics.flatMap((epic) => epic.tasks);
}

function parseEpicFilter(flags) {
  if (flags.epic === undefined) return undefined;
  const value = requireValue(flags, 'epic');
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new UsageError(`--epic must be an integer; got ${JSON.stringify(value)}`);
  }
  return num;
}

function parseStatusFilter(flags) {
  if (flags.status === undefined) return undefined;
  const value = requireValue(flags, 'status');
  if (!STATUS_VALUES.includes(value)) {
    throw new UsageError(`--status must be one of ${STATUS_VALUES.join(' | ')}; got ${JSON.stringify(value)}`);
  }
  return value;
}

function taskLine(task) {
  return `${task.id}  [${task.status}]  (epic ${task.epicNum})  ${task.title}`;
}

function tasks(ctx) {
  const plan = loadPlan(ctx.root);
  const epicFilter = parseEpicFilter(ctx.flags);
  const statusFilter = parseStatusFilter(ctx.flags);

  let rows = allTasks(plan);
  if (epicFilter !== undefined) rows = rows.filter((t) => t.epicNum === epicFilter);
  if (statusFilter !== undefined) rows = rows.filter((t) => t.status === statusFilter);

  return {
    data: { tasks: rows },
    text: lines(rows.length ? rows.map(taskLine) : ['(no matching tasks)']),
  };
}

function epicLine(epic) {
  const { done, inProgress, planned } = epic.tally;
  return `Epic ${epic.num}  [${epic.status}]  ${epic.title}  (done:${done} in_progress:${inProgress} planned:${planned})`;
}

function epics(ctx) {
  const plan = loadPlan(ctx.root);
  return {
    data: { epics: plan.epics },
    text: lines(plan.epics.length ? plan.epics.map(epicLine) : ['(no epics)']),
  };
}

function firstPlanned(plan) {
  for (const epic of plan.epics) {
    for (const task of epic.tasks) {
      if (task.status === Status.PLANNED) return { task, epic };
    }
  }
  return null;
}

function next(ctx) {
  const plan = loadPlan(ctx.root);
  const found = firstPlanned(plan);
  if (!found) {
    return { data: { task: null, reason: 'no planned task' }, text: lines(['(no planned task)']) };
  }
  const { task, epic } = found;
  const epicSummary = { num: epic.num, title: epic.title, tag: epic.tag };
  return {
    data: { task, epic: epicSummary },
    text: lines([taskLine(task), `  from epic ${epic.num} — ${epic.title}`]),
  };
}

// Naming an epic is itself a request to see that epic, so a filtered view never
// collapses. The epic filter is the same one `tasks` uses, down to the error text.
function list(ctx) {
  const plan = loadPlan(ctx.root);
  const epicFilter = parseEpicFilter(ctx.flags);
  const scoped = epicFilter === undefined
    ? plan
    : { ...plan, epics: plan.epics.filter((epic) => epic.num === epicFilter) };
  const opts = { all: ctx.flags.all === true || epicFilter !== undefined };

  return { data: buildView(scoped, opts), text: lines(renderPlan(scoped, opts)) };
}

dispatch({
  name: 'roadmap',
  subcommands: {
    list: { summary: 'the whole plan — open work nested, done epics collapsed (--all, --epic N)', run: list },
    tasks: { summary: 'list roadmap tasks (--epic N, --status S)', run: tasks },
    epics: { summary: 'list roadmap epics with tallies', run: epics },
    next: { summary: 'first planned task in file order', run: next },
  },
});
