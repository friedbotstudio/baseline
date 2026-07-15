import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Step 2 — the three code-review oracles + the deferred diagram checks.
// Each oracle mirrors spec-rollout-enforceability-review/oracle.mjs:
// run*(ctx) -> {findings}, read-only, findings carry {check, severity, artifact}.

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const url = (p) => pathToFileURL(join(ROOT, p)).href;
const SEC = url('.claude/skills/security/oracle.mjs');
const SIM = url('.claude/skills/simplify/oracle.mjs');
const CS = url('.claude/skills/code-structure/oracle.mjs');
const DIAG = url('.claude/skills/spec-diagram-review/oracle.mjs');

const grounded = (f) => f.artifact != null;

describe('security oracle (AC-002)', () => {
  it('test_when_security_oracle_on_critical_report_then_grounded_finding', async () => {
    const m = await import(SEC);
    const report = '# Security Review\n\n### [CRITICAL] SQL injection\n- **File**: a.js:1\n';
    const { findings } = m.runSecurityOracle({ securityReport: report });
    assert.ok(findings.length >= 1, 'a Critical must produce a finding');
    assert.ok(findings.some(grounded), 'the finding is grounded (artifact != null)');
  });
});

describe('simplify oracle (AC-002)', () => {
  it('test_when_simplify_oracle_on_flagged_table_then_finding', async () => {
    const m = await import(SIM);
    const table = '| file | verdict | reason |\n|---|---|---|\n| a.js | flagged | god object |\n';
    const { findings } = m.runSimplifyOracle({ simplifyTable: table });
    assert.ok(findings.some((f) => /a\.js/.test(JSON.stringify(f))), 'a flagged row produces a finding');
  });
});

describe('code-structure oracle — D6 gating (AC-002)', () => {
  it('test_when_code_structure_oracle_on_long_file_then_groundable_blocker', async () => {
    const m = await import(CS);
    const longFile = Array.from({ length: 90 }, (_, i) => `const x${i} = ${i};`).join('\n');
    const { findings } = m.runCodeStructureOracle({ changedFiles: [{ path: 'orch.js', content: longFile }] });
    const lenFinding = findings.find((f) => /80|length|long/i.test(JSON.stringify(f)));
    assert.ok(lenFinding, 'a >80-line file produces a finding');
    assert.ok(grounded(lenFinding), 'the length finding is groundable (BLOCKER-capable, D6 not advisory)');
  });
});

describe('spec-diagram oracle — deferred checks (AC-003)', () => {
  const specWith = (design, ddl, acRow, seqTitles) => `# Spec\n\n## Design\n\n\`\`\`plantuml\n@startuml\ntitle class\n${design}\n@enduml\n\`\`\`\n\n#### Migration DDL\n\`\`\`sql\n${ddl}\n\`\`\`\n\n${seqTitles}\n\n## Acceptance criteria\n\n| ID | Criterion | Kind | Upstream | Sequence |\n|---|---|---|---|---|\n${acRow}\n`;

  it('test_when_class_new_field_without_ddl_then_diagram_finding', async () => {
    const m = await import(DIAG);
    const spec = specWith('class Order {\n  +total_cents: int <<new>>\n}', '-- nothing', '| AC-001 | x | behavior | i1 | §Behavior #1 |', "```plantuml\n@startuml\ntitle Behavior #1\nactor A\nA -> A : x\n@enduml\n```");
    const { findings } = m.runDiagramOracle(spec);
    assert.ok(findings.some((f) => /ddl|alter|migration/i.test(JSON.stringify(f))), 'a <<new>> field without ALTER is flagged');
  });

  it('test_when_ac_without_matching_sequence_then_diagram_finding', async () => {
    const m = await import(DIAG);
    const spec = specWith('class X {\n +id: int\n}', 'ALTER TABLE t ADD c int;', '| AC-001 | x | behavior | i1 | §Behavior #9 |', "```plantuml\n@startuml\ntitle Behavior #1\nactor A\nA -> A : x\n@enduml\n```");
    const { findings } = m.runDiagramOracle(spec);
    assert.ok(findings.some((f) => /sequence|behavior|#9/i.test(JSON.stringify(f))), 'an AC whose §Behavior #N has no sequence is flagged');
  });

  it('test_when_container_absent_from_component_then_diagram_finding', async () => {
    const m = await import(DIAG);
    const spec = `# Spec\n\n## Design\n\n\`\`\`plantuml\n@startuml\n!include <C4/C4_Container>\nContainer(api, "API", "node", "r")\nContainer(worker, "W", "node", "r")\n@enduml\n\`\`\`\n\n\`\`\`plantuml\n@startuml\n!include <C4/C4_Component>\nContainer_Boundary(api, "API") { Component(c, "c", "t", "r") }\n@enduml\n\`\`\`\n\n## Acceptance criteria\n\n| ID | Criterion | Kind | Upstream | Sequence |\n|---|---|---|---|---|\n| AC-001 | x | behavior | i1 | §Behavior #1 |\n`;
    const { findings } = m.runDiagramOracle(spec);
    assert.ok(findings.some((f) => /container|component|worker/i.test(JSON.stringify(f))), 'a Container with no matching Component boundary is flagged');
  });
});
