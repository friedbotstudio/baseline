// Foundation — translate a workflows.jsonl Track record into a canonical
// TaskList shape. Used by triage at workflow-seed time AND by the
// byte-equivalent-migration tests (compared to golden fixtures).
//
// The returned shape is ordinal-positioned (1-indexed `ord`); `blockedBy`
// references predecessor ordinals (NOT session task_ids). The runtime
// caller (triage skill body, harness re-seed) translates ordinals to
// TaskCreate-assigned task_ids at materialization time.
//
// Selector nodes resolve to their default alternate (the first alternate
// with empty preconditions). Sub-track refs read the originating track's
// `_allTracks` Map (attached by the validator) to find the target track.

export function materializeTaskList(track, { slug, ctx } = {}) {
  if (!slug) {
    throw new Error('materializeTaskList requires a slug option (used for <slug> substitution in subjects/activeForms).');
  }
  const emitter = createEmitter(slug, track._allTracks ?? new Map(), ctx);
  emitNodes(track.nodes, emitter);
  return finalize(emitter);
}

function createEmitter(slug, allTracks, ctx) {
  return {
    slug,
    allTracks,
    ctx: ctx ?? null,
    tasks: [],
    idToOrd: new Map(),
  };
}

function emitNodes(nodes, emitter) {
  for (const node of nodes) {
    emitNode(node, emitter);
  }
}

function emitNode(node, emitter) {
  if (node.type === 'selector') {
    const chosen = evaluateAlternates(node, emitter.ctx);
    if (!chosen) {
      throw new Error(
        `Selector node '${node.id}' has no alternate whose preconditions pass against the provided context. ` +
        `Either provide a ctx that satisfies one alternate's preconditions, or declare an alternate with empty preconditions (unconditional default).`
      );
    }
    emitAlternate(chosen, node, emitter);
    return;
  }
  if (node.sub_track) {
    expandSubTrack(node.sub_track, node, emitter);
    return;
  }
  recordTask(node, emitter, []);
}

function emitAlternate(alternate, parentNode, emitter) {
  if (alternate.sub_track) {
    expandSubTrack(alternate.sub_track, parentNode, emitter);
    return;
  }
  if (alternate.skill) {
    const synthetic = {
      id: parentNode.id,
      type: 'task',
      skill: alternate.skill,
      depends_on: parentNode.depends_on || [],
      blocks: parentNode.blocks || [],
      can_parallel: false,
      needs_user: false,
    };
    recordTask(synthetic, emitter, []);
    return;
  }
  throw new Error(`Alternate on selector '${parentNode.id}' has neither skill nor sub_track.`);
}

function expandSubTrack(subTrackId, parentNode, emitter) {
  const sub = emitter.allTracks.get(subTrackId);
  if (!sub) {
    throw new Error(`sub_track '${subTrackId}' referenced by node '${parentNode.id}' not found in _allTracks.`);
  }
  const parentDepends = parentNode.depends_on || [];
  const beforeOrd = emitter.tasks.length;
  for (const subNode of sub.nodes) {
    const isEntry = !subNode.depends_on || subNode.depends_on.length === 0;
    const effectiveDepends = isEntry ? parentDepends : subNode.depends_on;
    recordTask(subNode, emitter, effectiveDepends);
    if (emitter.tasks.length === beforeOrd + 1) {
      emitter.idToOrd.set(parentNode.id, emitter.tasks[beforeOrd].ord);
    }
  }
}

function recordTask(node, emitter, effectiveDepends) {
  const ord = emitter.tasks.length + 1;
  emitter.idToOrd.set(node.id, ord);
  emitter.tasks.push({
    ord,
    subject: deriveSubject(node, emitter.slug),
    activeForm: deriveActiveForm(node),
    metadata: deriveMetadata(node),
    needs_user: !!node.needs_user,
    can_parallel: !!node.can_parallel,
    _dependsOnIds: effectiveDepends.length > 0 ? effectiveDepends : (node.depends_on || []),
  });
}

function finalize(emitter) {
  const out = [];
  for (const task of emitter.tasks) {
    const blockedBy = task._dependsOnIds
      .map((id) => emitter.idToOrd.get(id))
      .filter((ord) => typeof ord === 'number');
    out.push({
      ord: task.ord,
      subject: task.subject,
      activeForm: task.activeForm,
      metadata: task.metadata,
      needs_user: task.needs_user,
      can_parallel: task.can_parallel,
      blockedBy,
    });
  }
  return out;
}

// evaluateAlternates walks the selector node's alternates in declaration order
// and returns the first one whose preconditions all pass against ctx. When ctx
// is null/undefined, only alternates with empty preconditions are eligible
// (preserves the materialize-time-only default-fallback behavior used by tests
// that don't pass a ctx — e.g., the byte-equivalent fixture comparison). When
// ctx is provided, predicates evaluate against its fields:
//   { isGit: bool, componentCount: int, userOverride: string|null,
//     completed: string[], knownSkills: Set<string> }
// Any predicate whose required field is absent in ctx evaluates false.
function evaluateAlternates(selectorNode, ctx) {
  const alts = selectorNode.alternates || [];
  for (const alt of alts) {
    const preconditions = Array.isArray(alt.preconditions) ? alt.preconditions : [];
    if (preconditions.every((p) => evaluatePredicate(p, ctx))) {
      return alt;
    }
  }
  return null;
}

function evaluatePredicate(pred, ctx) {
  if (!ctx) return false;
  switch (pred.name) {
    case 'requires_git':
      return ctx.isGit === true;
    case 'requires_user_override':
      return typeof ctx.userOverride === 'string' && ctx.userOverride === pred.argument;
    case 'requires_min_components': {
      const n = parseInt(pred.argument, 10);
      return Number.isFinite(n) && typeof ctx.componentCount === 'number' && ctx.componentCount >= n;
    }
    case 'requires_phase_completed':
      return Array.isArray(ctx.completed) && ctx.completed.includes(pred.argument);
    case 'requires_skill_present':
      return ctx.knownSkills instanceof Set && ctx.knownSkills.has(pred.argument);
    default:
      return false;
  }
}

const ACTIVE_FORM_OVERRIDES = Object.freeze({
  tdd: 'Running TDD',
  intake: 'Running intake',
  scout: 'Running scout',
  research: 'Running research',
  spec: 'Running spec',
  simplify: 'Running simplify',
  security: 'Running security',
  integrate: 'Running integrate',
  document: 'Running document',
  archive: 'Running archive',
  'memory-flush': 'Running memory-flush',
  changelog: 'Running changelog',
  commit: 'Running commit',
  chore: 'Running chore',
  'swarm-plan': 'Running swarm-plan',
  'swarm-dispatch': 'Running swarm-dispatch',
});

const CONSENT_GATE_SUBJECTS = Object.freeze({
  'approve-spec': 'Wait for /approve-spec <path>',
  'grant-commit': 'Wait for /grant-commit',
  'approve-swarm': 'Wait for /approve-swarm <slug>',
});

const CONSENT_GATE_ACTIVE_FORMS = Object.freeze({
  'approve-spec': 'Awaiting spec approval',
  'grant-commit': 'Awaiting commit consent',
  'approve-swarm': 'Awaiting swarm approval',
});

function deriveSubject(node, slug) {
  if (node.needs_user) {
    return CONSENT_GATE_SUBJECTS[node.id] ?? `Wait for /${node.id}`;
  }
  const skill = node.skill || node.id;
  return `Run /${skill} for ${slug}`;
}

function deriveActiveForm(node) {
  if (node.activeForm) return node.activeForm;
  if (node.needs_user) {
    return CONSENT_GATE_ACTIVE_FORMS[node.id] ?? `Awaiting /${node.id}`;
  }
  const skill = node.skill || node.id;
  return ACTIVE_FORM_OVERRIDES[skill] ?? `Running ${skill}`;
}

function deriveMetadata(node) {
  const phase = node.metadata?.phase ?? node.skill ?? node.id;
  if (node.needs_user) {
    return { phase, needs_user: true };
  }
  return { phase };
}
