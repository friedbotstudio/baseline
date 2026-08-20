// planner.mjs — Domain: select a dependency-ready, cohesive sprint from already-decomposed
// roadmap tasks. Pure functions; readiness is computed here from per-task done
// status (the roadmap's machine-readable signal), NOT pushed into graph.mjs.
//
// A task is a roadmap item { id, epic, title, deps[], priority, done_record, edge_tests[],
// wiring_test }. statusById maps id -> 'done' | 'planned' | 'in-progress'.

export function computeReadiness(task, statusById) {
  const blockedBy = (task.deps || []).filter((dep) => statusById[dep] !== 'done');
  return { ready: blockedBy.length === 0, blockedBy };
}

function toFeature(task) {
  return {
    id: task.id,
    epic: task.epic,
    priority: task.priority ?? 99,
    done_record: task.done_record,
    edge_tests: task.edge_tests || [],
    wiring_test: task.wiring_test,
  };
}

// Propose a sprint: the ready candidates (excluding already-done tasks), sorted by priority,
// preferring cohesion with the highest-priority ready task's epic, capped at capacity.
// Unready candidates are returned as `excluded` with the unmet prerequisites named.
export function selectSprint({ tasks, statusById, capacity = 4 }) {
  const excluded = [];
  const ready = [];
  for (const task of tasks) {
    if (statusById[task.id] === 'done') continue;
    const readiness = computeReadiness(task, statusById);
    if (readiness.ready) ready.push(toFeature(task));
    else excluded.push({ id: task.id, blockedBy: readiness.blockedBy });
  }
  ready.sort((a, b) => a.priority - b.priority);
  const anchorEpic = ready.length ? ready[0].epic : null;
  const cohesive = [...ready].sort(
    (a, b) => Number(b.epic === anchorEpic) - Number(a.epic === anchorEpic),
  );
  return { features: cohesive.slice(0, capacity), excluded };
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───
//
// The inline block was a stub: `node -e "import(...).then(({selectSprint})=>{ /* pass
// {tasks,statusById,capacity} */ })"` — a comment where the call should be. It could
// not be run as written, which is the strongest case in the sweep that an inline
// import is not a front door.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const USAGE = `usage: node .claude/skills/sprint-planner/planner.mjs select <input.json | -> [--capacity N]

subcommands:
  select   propose the next dependency-ready sprint

arguments:
  <input.json>  a path, or literal JSON, or \`-\` to read stdin.
                shape: {tasks, statusById, capacity?}

flags:
  --capacity N  override the capacity in the input document
  --json        emit machine-readable output
`;

function readInput(given) {
  if (given === '-') return readFileSync(0, 'utf8');
  if (given.trimStart().startsWith('{')) return given;
  return readFileSync(given, 'utf8');
}

function renderProposal({ features }) {
  if (!features.length) return '(no dependency-ready task)\n';
  return features.map((feature) => `  ${feature.id}`).join('\n') + '\n';
}

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'select') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const given = argv[1];
  if (!given || given.startsWith('--')) { process.stderr.write(`select requires an input document\n\n${USAGE}`); return 1; }

  let input;
  try {
    input = JSON.parse(readInput(given));
  } catch (error) {
    process.stderr.write(`cannot parse the input document: ${error.message}\n`);
    return 1;
  }
  if (!input || typeof input !== 'object' || !Array.isArray(input.tasks)) {
    process.stderr.write('the input document needs a `tasks` array\n');
    return 1;
  }

  const capacityIndex = argv.indexOf('--capacity');
  const capacity = capacityIndex >= 0 ? Number(argv[capacityIndex + 1]) : input.capacity;
  const proposed = selectSprint({
    tasks: input.tasks,
    statusById: input.statusById ?? {},
    ...(Number.isFinite(capacity) ? { capacity } : {}),
  });

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(proposed, null, 2) + '\n'); return 0; }
  process.stdout.write(renderProposal(proposed));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
