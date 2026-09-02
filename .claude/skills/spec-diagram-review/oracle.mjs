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

function blocksFor(content, includeMarker) {
  const re = new RegExp(`!include\\s+<${includeMarker}>([\\s\\S]*?)@enduml`, 'g');
  return [...content.matchAll(re)].map((m) => m[1]).join('\n');
}

// (a) A class field marked <<new>>/<<changed>> must have a matching column in the
// ```sql Migration DDL``` block, or the class diagram and the migration have drifted.
function checkClassDDL(content, mandatory) {
  const ddl = (/```sql([\s\S]*?)```/i.exec(content) || [null, ''])[1];
  const out = [];
  // Line-scoped and ^-anchored so the field scan is O(n), never O(n^2): a global
  // `(\w+)\s*:` over the whole spec backtracks across every position on a long
  // word-run with no colon (ReDoS, CWE-1333). Class fields are one per line.
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*\+?\s*(\w+)\s*:[^\n]*<<(new|changed)>>/.exec(line);
    if (!m) continue;
    const field = m[1];
    if (!new RegExp(`\\b${field}\\b`, 'i').test(ddl)) {
      out.push(normalizeFinding({
        check: 'class_ddl_consistency', file: null, line: null,
        evidence: `field ${field} <<${m[2]}>> has no matching column in the Migration DDL`,
        message: `Class field ${field} is marked <<${m[2]}>> but the Migration DDL has no matching ALTER/ADD.`,
        suggested_fix: `Add a DDL statement for ${field}, or drop the <<${m[2]}>> stereotype.`,
        artifact: { kind: 'class-ddl', field },
      }, { mandatory }));
    }
  }
  return out;
}

/** The `## Acceptance criteria` body. `^` anchored so a prose mention of the
 * heading inside another section cannot hijack the match. Exported so the
 * conformance check calls this reader rather than a copy of its pattern. */
export function acceptanceCriteriaSection(content) {
  return (/^##\s+Acceptance criteria([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(String(content ?? '')) || [null, ''])[1];
}

/** Behavior ids this spec declares as `### Behavior #N` headings. */
export function behaviorHeadingIds(content) {
  return [...String(content ?? '').matchAll(/^###\s+Behavior\s*#(\d+)\b/gim)].map((m) => Number(m[1]));
}

// (b) Every AC row's §Behavior #N must resolve to a titled sequence.
function checkAcSequence(content, mandatory) {
  const titles = new Set();
  for (const t of content.matchAll(/title\s+Behavior\s*#(\d+)/gim)) titles.add(Number(t[1]));
  // `\b` guard: `### Behavior #12b` must not resolve to behavior 12, or two
  // headings collapse onto one id and an AC row anchors to the wrong section.
  // Matches spec-lint's reader (lint.mjs), which already carried the guard.
  for (const t of content.matchAll(/^###\s+Behavior\s*#(\d+)\b/gim)) titles.add(Number(t[1]));
  const section = acceptanceCriteriaSection(content);
  const out = [];
  for (const r of section.matchAll(/^\|\s*(AC-\d+)\s*\|[^\n]*?§?Behavior\s*#(\d+)/gm)) {
    const n = Number(r[2]);
    if (!titles.has(n)) {
      out.push(normalizeFinding({
        check: 'ac_sequence_consistency', file: null, line: null,
        evidence: `${r[1]} -> §Behavior #${n} has no titled sequence`,
        message: `AC ${r[1]} references §Behavior #${n} but no sequence titled "Behavior #${n}" exists.`,
        suggested_fix: `Add a sequence diagram titled "Behavior #${n}".`,
        artifact: { kind: 'ac-sequence', ac: r[1], behavior: n },
      }, { mandatory }));
    }
  }
  return out;
}

// (c) Every Container in the C4_Container diagram must have a matching Component boundary.
function checkContainerComponent(content, mandatory) {
  const containerBlock = blocksFor(content, 'C4/C4_Container');
  const componentBlock = blocksFor(content, 'C4/C4_Component');
  const boundaries = new Set([...componentBlock.matchAll(/Container_Boundary\(\s*(\w+)/g)].map((m) => m[1]));
  const out = [];
  for (const c of containerBlock.matchAll(/\bContainer(?:Db|Queue)?\(\s*(\w+)/g)) {
    if (!boundaries.has(c[1])) {
      out.push(normalizeFinding({
        check: 'container_component_consistency', file: null, line: null,
        evidence: `Container ${c[1]} has no matching C4_Component boundary`,
        message: `Container ${c[1]} appears in C4_Container but no C4_Component boundary of that name exists.`,
        suggested_fix: `Add a Container_Boundary(${c[1]}, ...) component diagram, or confirm it is unchanged.`,
        artifact: { kind: 'container-component', container: c[1] },
      }, { mandatory }));
    }
  }
  return out;
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

  findings.push(...checkClassDDL(content, mandatory));
  findings.push(...checkAcSequence(content, mandatory));
  findings.push(...checkContainerComponent(content, mandatory));

  return { findings };
}
