// spec-diagram-review oracle (-d186) — mechanical, artifact-backed checks for the
// diagram review. A finding may BLOCK only when it carries a concrete ArtifactRef
// AND the checker is `mandatory` per the tier dial; otherwise it is ADVISORY.
// This is the oracle-binding contract: a cycle / missing-member is an artifact,
// never LLM prose, so a downstream checker cannot agree with a hallucination.
//
// Relief valve (spec Open questions): DFS-acyclicity is the load-bearing BLOCKER
// check shipped this pass. class<<->>DDL and AC<->sequence consistency are left as
// ADVISORY-only and deferred to a follow-up.

import { resolveCheckerThreshold } from '../../hooks/lib/tier-dial.mjs';

const CHECKER = 'spec-diagram';

/** Coerce a finding's severity: BLOCKER only with an ArtifactRef AND a mandatory checker. */
export function normalizeFinding(finding, { mandatory }) {
  const canBlock = finding.artifact != null && mandatory === true;
  return { ...finding, severity: canBlock ? 'BLOCKER' : 'ADVISORY' };
}

function extractDependencyEdges(content) {
  const edges = [];
  let inGraph = false;
  for (const line of content.split(/\r?\n/)) {
    if (/@kind\s+dependency-graph/.test(line)) inGraph = true;
    if (!inGraph) continue;
    if (/@enduml/.test(line)) inGraph = false;
    const m = /\[([^\]]+)\]\s*-->\s*\[([^\]]+)\]/.exec(line);
    if (m) edges.push([m[1].trim(), m[2].trim()]);
  }
  return edges;
}

/** Return a cycle path [n1, n2, ..., n1] via DFS, or null when the graph is acyclic. */
function findCycle(edges) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  const nodes = new Set(edges.flat());

  const visit = (node) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adj.get(node) || []) {
      if (color.get(next) === GRAY) {
        const from = stack.indexOf(next);
        return [...stack.slice(from), next];
      }
      if ((color.get(next) || WHITE) === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const node of nodes) {
    if ((color.get(node) || WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function runDiagramOracle(content, deps = {}) {
  const tierDial = deps.tierDial || resolveCheckerThreshold;
  const { mandatory } = tierDial(CHECKER);
  const findings = [];

  const cycle = findCycle(extractDependencyEdges(content));
  if (cycle) {
    findings.push(normalizeFinding({
      check: 'dependency_graph_acyclic',
      file: null,
      line: null,
      evidence: cycle.join(' -> '),
      message: 'Dependency graph contains a cycle; A --> B reads "A depends on B".',
      suggested_fix: 'Break the cycle by inverting or removing one edge.',
      artifact: { kind: 'cycle', locus: cycle.join('->') },
    }, { mandatory }));
  }

  return { findings };
}
