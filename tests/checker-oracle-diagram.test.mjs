// spec-diagram-review oracle — AC-002 (oracle-binding: artifact-backed BLOCKER, else ADVISORY)
// SUT: .claude/skills/spec-diagram-review/oracle.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/spec-diagram-review/oracle.mjs');

const cyclicSpec = [
  '# Spec', '## Design',
  "```plantuml", "@startuml", "' @kind dependency-graph",
  '[a] --> [b]', '[b] --> [c]', '[c] --> [a]', '@enduml', '```',
].join('\n');
const acyclicSpec = [
  '# Spec', '## Design',
  "```plantuml", "@startuml", "' @kind dependency-graph",
  '[a] --> [b]', '[b] --> [c]', '@enduml', '```',
].join('\n');

const mandatoryDial = () => ({ floor: 0, mandatory: true });
const advisoryDial = () => ({ floor: null, mandatory: false });

describe('spec-diagram-review oracle (AC-002)', () => {
  it('test_when_diag_oracle_on_cyclic_graph_then_blocker_with_cycle_artifact', async () => {
    const { runDiagramOracle } = await import(SUT);
    const { findings } = runDiagramOracle(cyclicSpec, { tierDial: mandatoryDial });
    const cycle = findings.find((f) => f.check === 'dependency_graph_acyclic');
    assert.ok(cycle, 'a cycle must be reported');
    assert.equal(cycle.severity, 'BLOCKER');
    assert.ok(cycle.artifact && cycle.artifact.kind === 'cycle', 'BLOCKER carries a cycle ArtifactRef');
  });

  it('test_when_diag_oracle_acyclic_graph_then_clean', async () => {
    const { runDiagramOracle } = await import(SUT);
    const { findings } = runDiagramOracle(acyclicSpec, { tierDial: mandatoryDial });
    assert.equal(findings.filter((f) => f.check === 'dependency_graph_acyclic').length, 0);
  });

  it('test_when_finding_lacks_artifact_emitted_blocker_then_coerced_advisory', async () => {
    const { normalizeFinding } = await import(SUT);
    const out = normalizeFinding({ severity: 'BLOCKER', check: 'x', artifact: null }, { mandatory: true });
    assert.equal(out.severity, 'ADVISORY', 'no ArtifactRef -> cannot block');
  });

  it('test_when_checker_not_mandatory_then_blocker_downgraded_advisory', async () => {
    const { runDiagramOracle } = await import(SUT);
    const { findings } = runDiagramOracle(cyclicSpec, { tierDial: advisoryDial });
    const cycle = findings.find((f) => f.check === 'dependency_graph_acyclic');
    assert.ok(cycle, 'finding still surfaced');
    assert.equal(cycle.severity, 'ADVISORY', 'not mandatory -> advisory even with an artifact');
  });
});
