// YAML invariants on .github/workflows/release.yml + .releaserc.json + package.json.
//
// Asserts the contracts the semantic-release-automation spec promises:
//   - push-driven triggers (main + next) and a workflow_dispatch retained for
//     docs-only redeploys
//   - three jobs (release → {deploy-pages, install-smoke}) with per-job
//     permission scopes
//   - SHA-pinning, no actions/cache, no cache: key on setup-*, harden-runner
//     first step in every job, concurrency serializes globally
//   - .releaserc.json branches + plugin chain
//   - semantic-release devDeps exact-pinned, release script wired
//
// Parsing strategy: no third-party YAML dep. The release.yml shape is
// controlled by this project, so line-based regex + indent-aware sub-block
// extraction is sufficient — and avoids breaking the package's empty
// `dependencies` invariant (enforced by scripts/check-files-diff.mjs).
//
// Spec: docs/specs/semantic-release-automation.md (supersedes the prior
// release-workflow spec). ACs covered: AC-001 .. AC-013.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_YML = path.join(REPO_ROOT, '.github/workflows/release.yml');
const RELEASERC = path.join(REPO_ROOT, '.releaserc.json');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

// ---------- Foundation: file loaders ----------

function readReleaseYaml() {
  if (!existsSync(RELEASE_YML)) {
    throw new Error(
      `.github/workflows/release.yml does not exist yet — implement worker must create it. ` +
      `Expected at: ${RELEASE_YML}`
    );
  }
  return readFileSync(RELEASE_YML, 'utf8');
}

function readReleaserc() {
  if (!existsSync(RELEASERC)) {
    throw new Error(
      `.releaserc.json does not exist yet — implement worker must create it. Expected at: ${RELEASERC}`
    );
  }
  return JSON.parse(readFileSync(RELEASERC, 'utf8'));
}

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
}

// ---------- Foundation: YAML sub-block extractors ----------

// Extract the block of lines that belong to a top-level YAML key at column 0.
// Returns the slice between the opening `<key>:` line and the next line at
// column 0 (or EOF). Useful for top-level `jobs:`, `on:`, `concurrency:`, etc.
function topLevelBlock(text, key) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex(
    (line, i) => i > startIdx && /^[A-Za-z]/.test(line)
  );
  const slice = endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return slice.join('\n');
}

// Extract the block of lines for a job named <name> under `jobs:`. The job
// header is indented 2 spaces (`  <name>:`); the body lines are indented >=4.
function jobBlock(text, name) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`  ${name}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex(
    (line, i) => i > startIdx && /^ {0,2}\S/.test(line) && !line.startsWith(`  ${name}:`)
  );
  const slice = endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return slice.join('\n');
}

// Inside a job block, return the lines that belong to a named sub-key
// (`permissions:`, `steps:`, etc.). The sub-key is at indent 4; body at >=6.
function subBlock(blockText, subKey) {
  const lines = blockText.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`    ${subKey}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex(
    (line, i) => i > startIdx && /^ {0,4}\S/.test(line)
  );
  const slice = endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return slice.join('\n');
}

// Inside an `on:` block, return the lines for a named input under
// `workflow_dispatch.inputs:`. Input key is at indent-6; body at >=8.
function inputBlock(onBlockText, inputName) {
  const lines = onBlockText.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`      ${inputName}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex(
    (line, i) => i > startIdx && /^ {0,6}\S/.test(line)
  );
  const slice = endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx);
  return slice.join('\n');
}

// Parse a permissions sub-block into an object {key: value}. Returns {} for an
// inline empty object `permissions: {}`. Returns null when no block was found.
function parsePermissions(blockText) {
  if (!blockText) return null;
  if (/permissions:\s*\{\s*\}/.test(blockText)) return {};
  const out = {};
  for (const raw of blockText.split('\n').slice(1)) {
    const m = raw.match(/^\s{6,}([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(\S+)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Names of every job declared in release.yml (indent-2 headers under `jobs:`).
function jobNames(text) {
  const jobsSection = topLevelBlock(text, 'jobs');
  if (!jobsSection) return [];
  return jobsSection
    .split('\n')
    .filter((line) => /^ {2}[A-Za-z][A-Za-z0-9_-]*:\s*$/.test(line))
    .map((line) => line.trim().replace(/:$/, ''));
}

// Every `uses:` directive in the file, with its left-trimmed value.
function usesDirectives(text) {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*-?\s*uses:\s*(.+?)\s*$/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

// Return the single-line `if:` predicate value declared at indent-4 inside a
// job block. Returns null when no `if:` line is present.
function jobIfPredicate(text, name) {
  const block = jobBlock(text, name);
  if (!block) return null;
  const m = block.match(/^ {4}if:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

// Concatenated `run:` script content of every step in a job. Single-line `run:`
// scalars are joined with newlines; block scalars (`run: |`) are flattened the
// same way. Sufficient for substring assertions like "contains `npm ci`".
function jobRunScripts(text, name) {
  const block = jobBlock(text, name);
  if (!block) return '';
  return block
    .split('\n')
    .map((line) => {
      const single = line.match(/^\s*run:\s*(.+)$/);
      if (single && single[1] !== '|' && single[1] !== '>') return single[1];
      if (/^\s{8,}\S/.test(line)) return line.trim();
      return null;
    })
    .filter(Boolean)
    .join('\n');
}

// ---------- Domain: AC-012 / AC-001 / AC-002 — trigger contract ----------

describe('release-workflow — trigger contract (push branches + workflow_dispatch)', () => {
  it('test_when_yaml_parsed_then_push_branches_are_main_and_next', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    assert.ok(onBlock, 'release.yml must have a top-level `on:` block');
    assert.match(onBlock, /push:/, '`on:` must include `push:`');
    const pushBlock = onBlock.match(/^ {2}push:[\s\S]*?(?=^ {0,2}\S|\Z)/m);
    assert.ok(pushBlock, '`on.push:` block must be locatable');
    assert.match(pushBlock[0], /branches:\s*\[\s*main\s*,\s*next\s*\]/,
      '`on.push.branches` must equal `[main, next]` (inline-list form)');
  });

  it('test_when_yaml_parsed_then_workflow_dispatch_inputs_mode_options_is_docs_only_only', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    const modeBlock = inputBlock(onBlock || '', 'mode');
    assert.ok(modeBlock, '`workflow_dispatch.inputs.mode:` must be present');
    assert.match(modeBlock, /type:\s*choice/, 'mode must declare `type: choice`');
    assert.match(modeBlock, /default:\s*docs-only\b/, 'mode default must be `docs-only`');
    assert.match(modeBlock, /-\s*docs-only\s*$/m, 'mode.options must include `- docs-only`');
    assert.equal(/-\s*release\s*$/m.test(modeBlock), false,
      'mode.options must NOT include `- release` (release mode was removed)');
  });

  it('test_when_yaml_parsed_then_workflow_dispatch_inputs_has_no_bump_type', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    const bumpTypeBlock = inputBlock(onBlock || '', 'bump_type');
    assert.equal(bumpTypeBlock, null,
      '`workflow_dispatch.inputs.bump_type:` must be REMOVED (semantic-release derives the bump from commits)');
  });

  it('test_when_yaml_parsed_then_workflow_dispatch_inputs_mode_release_is_removed', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    const modeBlock = inputBlock(onBlock || '', 'mode');
    if (modeBlock) {
      assert.equal(/-\s*release\s*$/m.test(modeBlock), false,
        '`release` must not appear as a mode option');
    }
  });
});

// ---------- Domain: AC-012 — job graph + runs-on ----------

describe('release-workflow — job graph', () => {
  it('test_when_yaml_parsed_then_three_jobs_exist_release_deploypages_installsmoke', () => {
    const text = readReleaseYaml();
    assert.deepEqual(jobNames(text), ['release', 'deploy-pages', 'install-smoke'],
      `jobs must be exactly [release, deploy-pages, install-smoke] in order`);
  });

  it('test_when_yaml_parsed_then_every_job_runs_on_ubuntu_latest', () => {
    const text = readReleaseYaml();
    for (const name of jobNames(text)) {
      const block = jobBlock(text, name);
      assert.match(block, /^ {4}runs-on:\s*ubuntu-latest\s*$/m,
        `job \`${name}\` must declare \`runs-on: ubuntu-latest\``);
    }
  });
});

// ---------- Domain: AC-009 / AC-010 / AC-012 — per-job permissions ----------

describe('release-workflow — per-job permissions', () => {
  it('test_when_yaml_parsed_then_workflow_top_level_permissions_empty', () => {
    const text = readReleaseYaml();
    assert.match(text, /^permissions:\s*\{\s*\}\s*$/m,
      'top-level `permissions: {}` (empty object) must be present as the workflow baseline');
  });

  it('test_when_yaml_parsed_then_release_job_permissions_are_exact', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'release');
    assert.ok(block, 'release job must exist');
    const perms = parsePermissions(subBlock(block, 'permissions'));
    assert.deepEqual(perms,
      { contents: 'write', 'id-token': 'write', issues: 'write', 'pull-requests': 'write' },
      'release.permissions must be {contents: write, id-token: write, issues: write, pull-requests: write}');
  });

  it('test_when_yaml_parsed_then_deploy_pages_job_permissions_are_exact', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'deploy-pages');
    assert.ok(block, 'deploy-pages job must exist');
    const perms = parsePermissions(subBlock(block, 'permissions'));
    assert.deepEqual(perms,
      { pages: 'write', 'id-token': 'write', contents: 'read' },
      'deploy-pages.permissions must be {pages: write, id-token: write, contents: read}');
  });

  it('test_when_yaml_parsed_then_install_smoke_job_permissions_are_exact', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'install-smoke');
    assert.ok(block, 'install-smoke job must exist');
    const perms = parsePermissions(subBlock(block, 'permissions'));
    assert.deepEqual(perms, { contents: 'read' },
      'install-smoke.permissions must be {contents: read}');
  });
});

// ---------- Domain: AC-012 — SHA pinning, cache, harden-runner ----------

describe('release-workflow — supply-chain invariants', () => {
  it('test_when_yaml_parsed_then_every_third_party_uses_is_sha_pinned_with_tag_comment', () => {
    const text = readReleaseYaml();
    const uses = usesDirectives(text);
    assert.ok(uses.length > 0, 'release.yml must declare at least one `uses:` action');
    const violations = uses.filter((u) => {
      const owner = u.split('/')[0];
      if (owner === 'actions' || owner === 'github') return false;
      return !/^.+@[0-9a-f]{40}\s*#\s*v[0-9A-Za-z.+\-]+/.test(u);
    });
    assert.deepEqual(violations, [],
      `every third-party action must be SHA-pinned with trailing \`# vX.Y.Z\` comment; offenders:\n${violations.join('\n')}`);
  });

  it('test_when_yaml_parsed_then_no_actions_cache_used', () => {
    const text = readReleaseYaml();
    assert.equal(text.includes('actions/cache'), false,
      '`actions/cache` is forbidden in release workflows (runbook §Future-CI invariants Rule 2)');
  });

  it('test_when_yaml_parsed_then_no_setup_action_has_cache_key', () => {
    const text = readReleaseYaml();
    const lines = text.split('\n');
    const offenders = [];
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      if (/uses:\s*actions\/setup-/.test(lines[i])) { inBlock = true; continue; }
      if (!inBlock) continue;
      if (/^\s*-\s+/.test(lines[i]) || /^[A-Za-z]/.test(lines[i])) { inBlock = false; continue; }
      if (/^\s*cache:/.test(lines[i])) { offenders.push(`line ${i + 1}: ${lines[i].trim()}`); inBlock = false; }
    }
    assert.deepEqual(offenders, [],
      `no actions/setup-* step may declare a \`cache:\` key (action rejects \`cache: false\`; omit to disable). Offenders:\n${offenders.join('\n')}`);
  });

  it('test_when_yaml_parsed_then_every_job_first_step_is_harden_runner', () => {
    const text = readReleaseYaml();
    const jobs = jobNames(text);
    assert.ok(jobs.length > 0, 'at least one job must be declared');
    for (const name of jobs) {
      const block = jobBlock(text, name);
      const steps = subBlock(block, 'steps');
      assert.ok(steps, `job \`${name}\` must have a \`steps:\` block`);
      const firstUsesMatch = steps.match(/-\s*uses:\s*(\S+)/);
      assert.ok(firstUsesMatch, `job \`${name}\` first step must be a \`- uses:\` entry`);
      assert.ok(firstUsesMatch[1].startsWith('step-security/harden-runner@'),
        `job \`${name}\` first step must be step-security/harden-runner; got: ${firstUsesMatch[1]}`);
    }
  });
});

// ---------- Domain: AC-012 — concurrency ----------

describe('release-workflow — concurrency', () => {
  it('test_when_yaml_parsed_then_concurrency_group_serializes_globally', () => {
    const text = readReleaseYaml();
    const block = topLevelBlock(text, 'concurrency');
    assert.ok(block, 'release.yml must have a top-level `concurrency:` block');
    assert.match(block, /group:\s*release-/,
      'concurrency.group must start with `release-` (per-workflow grouping)');
  });

  it('test_when_yaml_parsed_then_concurrency_cancel_in_progress_is_false', () => {
    const text = readReleaseYaml();
    const block = topLevelBlock(text, 'concurrency');
    assert.match(block, /cancel-in-progress:\s*false/,
      'concurrency.cancel-in-progress must be the literal `false` (queue, do not cancel)');
  });
});

// ---------- Domain: AC-006 / AC-007 / AC-008 / AC-011 — needs + if predicates ----------

describe('release-workflow — needs + if predicates', () => {
  it('test_when_yaml_parsed_then_deploy_pages_needs_release', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'deploy-pages');
    const needs = block.match(/^ {4}needs:\s*(.+)$/m);
    assert.ok(needs, 'deploy-pages must declare `needs:`');
    const value = needs[1].trim();
    assert.ok(value === 'release' || value === '[release]' || value === '[ release ]',
      `deploy-pages.needs must reference \`release\`; got: ${value}`);
  });

  it('test_when_yaml_parsed_then_install_smoke_needs_release', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'install-smoke');
    const needs = block.match(/^ {4}needs:\s*(.+)$/m);
    assert.ok(needs, 'install-smoke must declare `needs:`');
    const value = needs[1].trim();
    assert.ok(value === 'release' || value === '[release]' || value === '[ release ]',
      `install-smoke.needs must reference \`release\`; got: ${value}`);
  });

  it('test_when_yaml_parsed_then_deploy_pages_if_gates_on_main_ref_and_release_published_or_docs_only', () => {
    const text = readReleaseYaml();
    const ifValue = jobIfPredicate(text, 'deploy-pages');
    assert.ok(ifValue, 'deploy-pages must declare an `if:` predicate');
    assert.match(ifValue, /github\.ref\s*==\s*'refs\/heads\/main'/,
      'deploy-pages.if must gate on `github.ref == \'refs/heads/main\'`');
    assert.match(ifValue, /needs\.release\.outputs\.new_release_published/,
      'deploy-pages.if must consult `needs.release.outputs.new_release_published`');
    assert.match(ifValue, /inputs\.mode\s*==\s*'docs-only'/,
      'deploy-pages.if must allow `inputs.mode == \'docs-only\'`');
  });

  it('test_when_yaml_parsed_then_install_smoke_if_requires_release_published_only', () => {
    const text = readReleaseYaml();
    const ifValue = jobIfPredicate(text, 'install-smoke');
    assert.ok(ifValue, 'install-smoke must declare an `if:` predicate');
    assert.match(ifValue, /needs\.release\.outputs\.new_release_published\s*==\s*'true'/,
      'install-smoke.if must require `needs.release.outputs.new_release_published == \'true\'`');
    assert.equal(/docs-only/.test(ifValue), false,
      'install-smoke.if must NOT allow docs-only (no smoke without a publish)');
  });
});

// ---------- Domain: AC-001 / AC-011 / AC-012 — release job structure ----------

describe('release-workflow — release job structure', () => {
  it('test_when_yaml_parsed_then_release_job_has_semantic_release_step_with_dispatch_gate', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'release');
    assert.ok(block, 'release job must exist');
    const steps = subBlock(block, 'steps');
    assert.ok(steps, 'release.steps must exist');
    assert.match(steps, /npx\s+semantic-release/,
      'release.steps must contain a step that invokes `npx semantic-release`');
    assert.match(steps, /if:\s*[^\n]*inputs\.mode\s*!=\s*'docs-only'/,
      'release.steps must gate the semantic-release step on `if: inputs.mode != \'docs-only\'`');
  });

  it('test_when_yaml_parsed_then_release_job_has_verify_action_shas_step', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'release');
    const steps = subBlock(block, 'steps');
    assert.match(steps, /node\s+scripts\/verify-action-shas\.mjs/,
      'release.steps must invoke `node scripts/verify-action-shas.mjs` (SHA-authenticity preflight)');
  });

  it('test_when_yaml_parsed_then_release_job_has_npm_ci_and_audit_signatures_steps', () => {
    const text = readReleaseYaml();
    const runs = jobRunScripts(text, 'release');
    assert.match(runs, /\bnpm ci\b/, 'release.steps must include `npm ci`');
    assert.match(runs, /\bnpm audit signatures\b/,
      'release.steps must include `npm audit signatures` (per semantic-release docs)');
  });

  it('test_when_yaml_parsed_then_release_job_outputs_declare_new_release_published_and_version', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'release');
    const outputs = subBlock(block, 'outputs');
    assert.ok(outputs, 'release must declare `outputs:`');
    assert.match(outputs, /new_release_published:\s*\$\{\{\s*steps\./,
      'release.outputs.new_release_published must reference a step output');
    assert.match(outputs, /new_release_version:\s*\$\{\{\s*steps\./,
      'release.outputs.new_release_version must reference a step output');
  });
});

// ---------- Domain: AC-001 / AC-002 ... AC-009 — .releaserc.json ----------

describe('releaserc — branches + plugin chain', () => {
  it('test_when_releaserc_parsed_then_branches_is_main_and_next_prerelease', () => {
    const cfg = readReleaserc();
    assert.deepEqual(cfg.branches, ['main', { name: 'next', prerelease: true }],
      `.releaserc.json branches must equal ['main', {name: 'next', prerelease: true}]; got: ${JSON.stringify(cfg.branches)}`);
  });

  it('test_when_releaserc_parsed_then_plugin_chain_is_correct_order', () => {
    const cfg = readReleaserc();
    assert.ok(Array.isArray(cfg.plugins), '.releaserc.json plugins must be an array');
    const names = cfg.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    assert.deepEqual(names, [
      '@semantic-release/commit-analyzer',
      '@semantic-release/release-notes-generator',
      '@semantic-release/changelog',
      '@semantic-release/npm',
      '@semantic-release/git',
      '@semantic-release/github',
    ], 'plugin chain order must be: commit-analyzer → release-notes-generator → changelog → npm → git → github');
  });
});

// ---------- Domain: AC-012 / AC-001 — package.json shape ----------

describe('package.json — semantic-release devDeps + release script', () => {
  const EXACT_VERSION_RE = /^\d+\.\d+\.\d+$/;

  it('test_when_package_json_parsed_then_semantic_release_devdep_is_exact_pinned', () => {
    const pkg = readPackageJson();
    const version = (pkg.devDependencies || {})['semantic-release'];
    assert.ok(version, 'package.json devDependencies must include `semantic-release`');
    assert.match(version, EXACT_VERSION_RE,
      `semantic-release devDep must be exact-pinned (DEVDEP_RANGE_FORBIDDEN); got: ${version}`);
  });

  it('test_when_package_json_parsed_then_changelog_plugin_devdep_is_exact_pinned', () => {
    const pkg = readPackageJson();
    const version = (pkg.devDependencies || {})['@semantic-release/changelog'];
    assert.ok(version, 'package.json devDependencies must include `@semantic-release/changelog`');
    assert.match(version, EXACT_VERSION_RE,
      `@semantic-release/changelog devDep must be exact-pinned; got: ${version}`);
  });

  it('test_when_package_json_parsed_then_git_plugin_devdep_is_exact_pinned', () => {
    const pkg = readPackageJson();
    const version = (pkg.devDependencies || {})['@semantic-release/git'];
    assert.ok(version, 'package.json devDependencies must include `@semantic-release/git`');
    assert.match(version, EXACT_VERSION_RE,
      `@semantic-release/git devDep must be exact-pinned; got: ${version}`);
  });

  it('test_when_package_json_parsed_then_release_script_invokes_semantic_release', () => {
    const pkg = readPackageJson();
    const script = (pkg.scripts || {}).release;
    assert.equal(script, 'semantic-release',
      `package.json scripts.release must equal "semantic-release"; got: ${JSON.stringify(script)}`);
  });

  it('test_when_package_json_parsed_then_existing_files_array_unchanged', () => {
    const pkg = readPackageJson();
    assert.deepEqual(pkg.files, ['bin/', 'src/', 'obj/template/', 'README.md'],
      'package.json `files:` must remain ["bin/", "src/", "obj/template/", "README.md"] — regression guard for the pack contract');
  });
});
