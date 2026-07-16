// gate-collapse-resolver — resolves how many human consent gates a workflow
// presents (D3/CO-E, spec docs/specs/gate-collapse.md D-5 / AC-003).
//
// The 3->2 base collapse ships ON by default: every workflow presents the two
// gates approve-direction + approve-landing. The 2->1 single-authorization
// FURTHER collapse activates ONLY when governance.class.enabled === true AND the
// workflow's Governance Class is low ({D,C}). Everything else — flag off, absent
// key, high class {A,B}, or an unresolved class — fails safe to two gates.
//
// Pure function; reads nothing from disk. The caller passes the already-read
// project.json object and the workflow's resolved governance_class (or null).

const LOW_CLASSES = new Set(['D', 'C']);

/**
 * @param {object} args
 * @param {object} args.projectJson - parsed .claude/project.json
 * @param {{class?: string}|null} args.governanceClass - workflow.json governance_class, or null
 * @returns {{mode: 'two-gate'|'single-auth', gates: string[]}}
 */
export function resolveGateCollapse({ projectJson, governanceClass } = {}) {
  const twoGate = { mode: 'two-gate', gates: ['approve-direction', 'approve-landing'] };

  const enabled = projectJson?.governance?.class?.enabled === true;
  if (!enabled) return twoGate;

  const klass = governanceClass?.class;
  if (typeof klass !== 'string' || !LOW_CLASSES.has(klass)) return twoGate;

  // Low-class + flag on: fold direction + landing into a single authorization.
  return { mode: 'single-auth', gates: ['approve-direction-and-landing'] };
}
