// spec-lint checker — the deferred adapter from backlog `-d186`.
//
// Why an adapter and not a direct import in the registry: the three checkers
// registered beside it (spec-diagram, spec-traceability, spec-rollout) each export
// a `run*Oracle(content) -> {findings}` shaped function from their own skill, so
// the registry can name them inline. `spec-lint` does not — it exports granular
// checks (`checkSystemDelta`, `checkApiSurfacePinned`) that return their own
// shapes. Composition has to live somewhere, and `checkers/` is where the two
// existing composed adapters already live.
//
// Only the two EXPORTED checks are wired. `spec-lint`'s other checks
// (plantuml_syntax, diagram_presence, ac_traceability, design_calls) are enforced
// at the Write boundary by their own hooks and by spec-diagram-review; running
// them again here would double-report the same defect under two checker names.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkSystemDelta, checkApiSurfacePinned } from '../../spec-lint/lint.mjs';

function readProjectJson(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, '.claude/project.json'), 'utf8'));
  } catch {
    return {};
  }
}

function minComponentsFor(project) {
  const declared = project?.swarm?.min_tasks_worth_swarming;
  return Number.isInteger(declared) ? declared : 1;
}

// `checkSystemDelta` answers PASS / FAIL / SKIP. Only FAIL is a finding, and it is
// a BLOCKER: an unresolvable delta row means the corpus and the spec disagree
// about what this change touches, which `archive` will refuse later anyway. SKIP
// (the architecture map is off) is silence, not a pass to report.
function systemDeltaFindings(specContent, project, rootDir) {
  const [status, detail] = checkSystemDelta(specContent, project, rootDir);
  if (status !== 'FAIL') return [];
  return [{
    severity: 'BLOCKER',
    check: 'system_delta',
    message: 'a System delta row does not resolve',
    evidence: detail,
  }];
}

// The API-surface check is ADVISORY by the spec-lint SOP's own wording — it never
// blocks gate A. Preserved here: promoting it to BLOCKER inside the fan-out would
// change its severity by moving it, which is not what registering it is for.
function apiSurfaceFindings(specContent, project) {
  const { ok, reason } = checkApiSurfacePinned(specContent, minComponentsFor(project));
  if (ok) return [];
  return [{
    severity: 'ADVISORY',
    check: 'api_surface_pinned',
    message: 'a swarm-bound spec leaves an API surface unpinned in Contracts',
    evidence: reason,
  }];
}

export const specLintAdapter = {
  phase: 'spec-review',
  run(ctx) {
    // Fail-open on absent content: the fan-out is a velocity optimization and must
    // never be the reason a landing stops. A genuinely missing spec is caught by
    // the fan-out's own reader, not here.
    if (!ctx?.specContent) return { findings: [] };

    const rootDir = ctx.rootDir ?? process.cwd();
    const project = readProjectJson(rootDir);

    try {
      return {
        findings: [
          ...systemDeltaFindings(ctx.specContent, project, rootDir),
          ...apiSurfaceFindings(ctx.specContent, project),
        ],
      };
    } catch {
      return { findings: [] };
    }
  },
};
