// project.json keys — the required config paths are present, and the live config
// agrees with the shipped consumer template outside the intentional-difference
// allowlist (so an oracle enabled for dev cannot silently ship dark).
import { checkConfigParity } from '../config-parity.mjs';

const EXPECTED_PATHS = [
  ['configured', ['configured']],
  ['test.cmd', ['test', 'cmd']],
  ['lint.cmd', ['lint', 'cmd']],
  ['tdd.source_globs', ['tdd', 'source_globs']],
  ['tdd.test_globs', ['tdd', 'test_globs']],
  ['tdd.exempt_globs', ['tdd', 'exempt_globs']],
  ['tdd.ui_globs', ['tdd', 'ui_globs']],
  ['destructive.hard_block_patterns', ['destructive', 'hard_block_patterns']],
  ['destructive.ask_patterns', ['destructive', 'ask_patterns']],
  ['artifacts.required_sections.intake', ['artifacts', 'required_sections', 'intake']],
  ['artifacts.required_sections.brd', ['artifacts', 'required_sections', 'brd']],
  ['artifacts.required_sections.spec', ['artifacts', 'required_sections', 'spec']],
  ['artifacts.required_sections.rca', ['artifacts', 'required_sections', 'rca']],
  ['artifacts.required_diagrams.spec', ['artifacts', 'required_diagrams', 'spec']],
  ['swarm.max_parallel', ['swarm', 'max_parallel']],
  ['swarm.isolation', ['swarm', 'isolation']],
  ['swarm.min_tasks_worth_swarming', ['swarm', 'min_tasks_worth_swarming']],
  ['swarm.refuse_dirty_tree', ['swarm', 'refuse_dirty_tree']],
  ['swarm.exempt_path_prefixes', ['swarm', 'exempt_path_prefixes']],
  ['swarm.enforced_path_prefixes', ['swarm', 'enforced_path_prefixes']],
  ['consent.commit_ttl_seconds', ['consent', 'commit_ttl_seconds']],
  ['consent.gate_marker_ttl_seconds', ['consent', 'gate_marker_ttl_seconds']],
  ['consent.push_ttl_seconds', ['consent', 'push_ttl_seconds']],
  ['git.protected_branches', ['git', 'protected_branches']],
  ['git.branch_pattern', ['git', 'branch_pattern']],
  ['additions.agents', ['additions', 'agents']],
  ['additions.skills', ['additions', 'skills']],
  ['additions.hooks', ['additions', 'hooks']],
  ['additions.mcp_servers', ['additions', 'mcp_servers']],
  ['additions.swarm_worker_skills', ['additions', 'swarm_worker_skills']],
];

export function run(ctx) {
  const rows = [];
  const add = (n, s, d = '') => rows.push([n, s, d]);
  const { pj } = ctx;
  if (pj === null) { add('project.json parses', 'FAIL', 'missing or invalid JSON'); return rows; }
  add('project.json parses', 'PASS', '');
  for (const [label, path] of EXPECTED_PATHS) {
    let cur = pj, ok = true;
    for (const k of path) {
      if (cur && typeof cur === 'object' && k in cur) cur = cur[k];
      else { ok = false; break; }
    }
    add(`project.json: ${label}`, ok ? 'PASS' : 'FAIL', ok ? '' : 'missing key');
  }
  const template = ctx.readJson('src/project.template.json');
  if (template === null) {
    add('project.json <-> template: config parity', 'FAIL', 'src/project.template.json missing or invalid JSON');
  } else {
    const { ok, drift } = checkConfigParity(pj, template);
    add('project.json <-> template: config parity', ok ? 'PASS' : 'FAIL', ok ? '' : `drift at ${drift}`);
  }
  return rows;
}
