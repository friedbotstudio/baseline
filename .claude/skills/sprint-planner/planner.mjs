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
