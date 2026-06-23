// Foundation: the org-team charter's decision helpers (graduated from sprint-mode.mjs).
// Org mode is opt-in and OFF by default. Unlike the sprint sandbox, a peer DECIDES its
// own in-lane implementation choices in its own main context (Article X); only
// cross-lane or un-decidable forks escalate. These pure helpers carry that distinction.

export function isOrgModeEnabled(project) {
  return project?.velocity?.org_mode?.enabled === true;
}

// Preflight: org-dispatch refuses unless org mode is on AND the tree is a git repo
// (worktree isolation requires git). Returns a named reason so the refusal is legible.
export function orgDispatchGate({ project, isGitRepo }) {
  if (!isOrgModeEnabled(project)) {
    return { ok: false, reason: 'org mode is OFF (velocity.org_mode.enabled); refusing' };
  }
  if (!isGitRepo) {
    return { ok: false, reason: 'org mode requires git (worktree isolation); refusing' };
  }
  return { ok: true };
}

// Decompose a spec's lanes into claim-any channel tasks. A lane carries a domain tag
// the claiming peer inherits (its in-lane decision latitude), the write_set it owns,
// and its dependency edges — no peer is pre-assigned (the pod is flat).
export function toLaneTasks(lanes) {
  return lanes.map((lane) => {
    if (!lane.id || !lane.lane) throw new Error(`lane missing id/lane: ${JSON.stringify(lane)}`);
    return {
      id: lane.id,
      lane: lane.lane,
      write_set: Array.isArray(lane.write_set) ? lane.write_set : [],
      depends_on: Array.isArray(lane.depends_on) ? lane.depends_on : [],
    };
  });
}

// The charter's load-bearing rule: an in-lane implementation choice is the peer's to
// decide; a cross-lane or un-decidable (design/scope/abstraction) fork escalates to
// the lead (who may escalate to the human). Anything not explicitly in-lane escalates.
export function classifyFork(fork) {
  return fork?.scope === 'in-lane-impl' ? 'decide' : 'escalate';
}
