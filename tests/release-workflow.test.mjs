// YAML invariants on .github/workflows/release.yml.
// Covers AC-001 (trigger contract), AC-004 (publish-npm permissions shape),
// AC-005 (SHA pinning), AC-006 (no actions/cache; cache: false on setup-*),
// AC-007 (harden-runner first step in every job), AC-008 (deploy-pages
// permissions shape), AC-011 (needs: chain), AC-012 (concurrency), plus
// a non-goal check that `prerelease` is absent from the bump_type options.
//
// Parsing strategy: no third-party YAML dep. The release.yml shape is
// controlled by this project, so line-based regex + indent-aware sub-block
// extraction is sufficient — and avoids breaking the package's empty
// `dependencies` invariant (enforced by scripts/check-files-diff.mjs).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_YML = path.join(REPO_ROOT, '.github/workflows/release.yml');

function readReleaseYaml() {
  if (!existsSync(RELEASE_YML)) {
    throw new Error(
      `.github/workflows/release.yml does not exist yet — implement worker must create it. ` +
      `Expected at: ${RELEASE_YML}`
    );
  }
  return readFileSync(RELEASE_YML, 'utf8');
}

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

// Parse a permissions sub-block into an object {key: value}.
function parsePermissions(blockText) {
  if (!blockText) return null;
  const out = {};
  for (const raw of blockText.split('\n').slice(1)) {
    const m = raw.match(/^\s{6,}([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(\S+)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
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

describe('release-workflow — AC-001 trigger contract', () => {
  it('test_when_release_yaml_has_workflow_dispatch_then_bump_type_is_choice_with_three_options', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    assert.ok(onBlock, 'release.yml must have a top-level `on:` block');
    assert.match(onBlock, /workflow_dispatch:/, '`on:` must include `workflow_dispatch:`');
    assert.match(
      onBlock,
      /bump_type:\s*$/m,
      '`workflow_dispatch.inputs` must include `bump_type:`'
    );
    // bump_type must be type: choice with exactly major/minor/patch options.
    // It is NOT required: true (the 2026-05-13 mode extension made it
    // optional — applies only when mode=release).
    const bumpTypeBlock = inputBlock(onBlock, 'bump_type');
    assert.ok(bumpTypeBlock, 'bump_type input block must be locatable inside workflow_dispatch.inputs');
    assert.match(bumpTypeBlock, /type:\s*choice/, 'bump_type must declare `type: choice`');
    assert.equal(
      /required:\s*true/.test(bumpTypeBlock),
      false,
      'bump_type must NOT declare `required: true` (mode extension made it optional)'
    );
    for (const opt of ['major', 'minor', 'patch']) {
      assert.match(
        bumpTypeBlock,
        new RegExp(`-\\s*${opt}\\s*$`, 'm'),
        `bump_type.options must include \`- ${opt}\``
      );
    }
  });
});

describe('release-workflow — AC-013 mode extension trigger contract', () => {
  it('test_when_release_yaml_has_workflow_dispatch_then_mode_is_choice_with_release_and_docs_only', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    assert.ok(onBlock, 'release.yml must have a top-level `on:` block');
    const modeBlock = inputBlock(onBlock, 'mode');
    assert.ok(modeBlock, '`workflow_dispatch.inputs` must include `mode:`');
    assert.match(modeBlock, /type:\s*choice/, 'mode must declare `type: choice`');
    assert.match(modeBlock, /required:\s*true/, 'mode must declare `required: true`');
    assert.match(modeBlock, /default:\s*release\b/, 'mode must declare `default: release` (preserves prior behavior on no-input)');
    for (const opt of ['release', 'docs-only']) {
      assert.match(
        modeBlock,
        new RegExp(`-\\s*${opt}\\s*$`, 'm'),
        `mode.options must include \`- ${opt}\``
      );
    }
  });
});

describe('release-workflow — AC-005 SHA pinning', () => {
  it('test_when_release_yaml_has_third_party_uses_then_each_is_pinned_to_40_char_sha_with_tag_comment', () => {
    const text = readReleaseYaml();
    const uses = usesDirectives(text);
    assert.ok(uses.length > 0, 'release.yml must declare at least one `uses:` action');
    const violations = [];
    for (const u of uses) {
      const owner = u.split('/')[0];
      if (owner === 'actions' || owner === 'github') continue;
      if (!/^.+@[0-9a-f]{40}\s*#\s*v[0-9A-Za-z.+\-]+/.test(u)) {
        violations.push(u);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `every third-party action must be pinned to a 40-char SHA with trailing \`# vX.Y.Z\` comment; offenders:\n${violations.join('\n')}`
    );
  });
});

describe('release-workflow — AC-006 cache invariants', () => {
  it('test_when_release_yaml_is_grepped_for_actions_cache_then_substring_is_absent', () => {
    const text = readReleaseYaml();
    assert.equal(
      text.includes('actions/cache'),
      false,
      '`actions/cache` is forbidden in release workflows (runbook Future-CI invariants Rule 2)'
    );
  });

  it('test_when_release_yaml_has_setup_node_blocks_then_none_declare_a_cache_key', () => {
    const text = readReleaseYaml();
    const setupNodeUses = usesDirectives(text).filter((u) => u.startsWith('actions/setup-node@'));
    assert.ok(
      setupNodeUses.length > 0,
      'release.yml must use actions/setup-node in at least one job'
    );
    // For every setup-node usage, the same block MUST NOT contain a `cache:`
    // key. The action's `cache` input only accepts a package-manager name
    // (`npm`, `yarn`, `pnpm`); the literal `false` is rejected with "Caching
    // for 'false' is not supported" and FAILS the step. The runbook's
    // "no actions/cache; no caching" rule is honored by OMITTING the key
    // (caching is off by default), not by setting it to false.
    const lines = text.split('\n');
    const offenders = [];
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      if (/uses:\s*actions\/setup-node@/.test(lines[i])) {
        inBlock = true;
        continue;
      }
      if (!inBlock) continue;
      if (/^\s*-\s+/.test(lines[i]) || /^[A-Za-z]/.test(lines[i])) {
        inBlock = false;
        continue;
      }
      if (/^\s*cache:/.test(lines[i])) {
        offenders.push(`line ${i + 1}: ${lines[i].trim()}`);
        inBlock = false;
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `setup-node blocks must NOT declare a \`cache:\` key (the action rejects \`cache: false\` and omitting the key is the canonical way to disable caching). Offenders:\n${offenders.join('\n')}`
    );
  });
});

describe('release-workflow — AC-007 harden-runner first step', () => {
  it('test_when_release_yaml_has_jobs_then_first_step_of_every_job_uses_harden_runner', () => {
    const text = readReleaseYaml();
    const jobs = jobNames(text);
    assert.ok(jobs.length > 0, 'release.yml must declare at least one job');
    for (const name of jobs) {
      const block = jobBlock(text, name);
      const steps = subBlock(block, 'steps');
      assert.ok(steps, `job \`${name}\` must have a \`steps:\` block`);
      // The first `uses:` line inside steps must be step-security/harden-runner.
      const firstUsesMatch = steps.match(/-\s*uses:\s*(\S+)/);
      assert.ok(firstUsesMatch, `job \`${name}\` steps must start with a \`- uses:\` entry`);
      assert.ok(
        firstUsesMatch[1].startsWith('step-security/harden-runner@'),
        `job \`${name}\` first step must be step-security/harden-runner; got: ${firstUsesMatch[1]}`
      );
    }
  });
});

describe('release-workflow — AC-012 concurrency', () => {
  it('test_when_release_yaml_has_top_level_concurrency_then_group_set_and_cancel_in_progress_false', () => {
    const text = readReleaseYaml();
    const block = topLevelBlock(text, 'concurrency');
    assert.ok(block, 'release.yml must have a top-level `concurrency:` block');
    assert.match(block, /group:\s*\S+/, 'concurrency.group must be a non-empty string');
    assert.match(
      block,
      /cancel-in-progress:\s*false/,
      'concurrency.cancel-in-progress must be the literal `false` (queue, do not cancel)'
    );
  });
});

describe('release-workflow — AC-004 publish-npm permissions shape', () => {
  it('test_when_release_yaml_has_publish_npm_job_then_permissions_are_id_token_write_and_contents_read_only', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'publish-npm');
    assert.ok(block, 'release.yml must declare a `publish-npm` job');
    const perms = parsePermissions(subBlock(block, 'permissions'));
    assert.ok(perms, 'publish-npm must declare a `permissions:` block');
    assert.deepEqual(
      perms,
      { 'id-token': 'write', contents: 'read' },
      `publish-npm.permissions must be exactly {id-token: write, contents: read}; got: ${JSON.stringify(perms)}`
    );
  });
});

describe('release-workflow — AC-008 deploy-pages permissions shape', () => {
  it('test_when_release_yaml_has_deploy_pages_job_then_permissions_are_pages_write_and_id_token_write', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'deploy-pages');
    assert.ok(block, 'release.yml must declare a `deploy-pages` job');
    const perms = parsePermissions(subBlock(block, 'permissions'));
    assert.ok(perms, 'deploy-pages must declare a `permissions:` block');
    assert.deepEqual(
      perms,
      { pages: 'write', 'id-token': 'write' },
      `deploy-pages.permissions must be exactly {pages: write, id-token: write}; got: ${JSON.stringify(perms)}`
    );
  });
});

describe('release-workflow — AC-011 needs chain', () => {
  it('test_when_release_yaml_has_publish_npm_and_deploy_pages_and_push_bump_and_install_smoke_then_each_needs_correct_predecessors', () => {
    const text = readReleaseYaml();
    // Each job's `needs:` MUST be exactly the listed predecessor set.
    // `deploy-pages` depends on BOTH `build-verify` (for the github-pages
    // artifact) and `publish-npm` (for sequencing on `release` mode and the
    // skipped-allowance gate on `docs-only` mode); single-predecessor
    // jobs use the scalar form, multi-predecessor jobs use the array form.
    const expected = {
      'publish-npm': ['build-verify'],
      'deploy-pages': ['build-verify', 'publish-npm'],
      'push-bump': ['publish-npm'],
      'install-smoke': ['publish-npm'],
    };
    for (const [job, predecessors] of Object.entries(expected)) {
      const block = jobBlock(text, job);
      assert.ok(block, `release.yml must declare a \`${job}\` job`);
      const scalar = block.match(/^\s{4}needs:\s*(\S[^\n[]*?)\s*$/m);
      const array = block.match(/^\s{4}needs:\s*\[\s*([^\]]+)\s*\]\s*$/m);
      let actual;
      if (array) {
        actual = array[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (scalar) {
        actual = [scalar[1].trim()];
      } else {
        assert.fail(`job \`${job}\` must declare \`needs:\``);
      }
      assert.deepEqual(
        [...actual].sort(),
        [...predecessors].sort(),
        `job \`${job}\` must declare \`needs: ${JSON.stringify(predecessors)}\`; got: ${JSON.stringify(actual)}`
      );
    }
  });
});

describe('release-workflow — non-goal: pre-release tag deferred', () => {
  it('test_when_release_yaml_has_workflow_dispatch_then_prerelease_choice_is_absent', () => {
    const text = readReleaseYaml();
    const onBlock = topLevelBlock(text, 'on');
    assert.ok(onBlock, 'release.yml must have a top-level `on:` block');
    const bumpTypeBlock = inputBlock(onBlock, 'bump_type');
    assert.ok(bumpTypeBlock, 'bump_type input block must exist');
    assert.equal(
      /^\s*-\s*prerelease\s*$/m.test(bumpTypeBlock),
      false,
      'bump_type options must NOT include `prerelease` (deferred per spec non-goal)'
    );
  });
});

describe('release-workflow — AC-014 script-injection hardening (env: bridge pattern)', () => {
  it('test_when_release_yaml_run_blocks_inspected_then_no_inputs_or_needs_interpolation_inside_shell_bodies', () => {
    const text = readReleaseYaml();
    // Extract every `run: |` block body (lines indented deeper than the `run:`
    // key itself) and assert none contain `${{ inputs.* }}` or `${{ needs.* }}`
    // interpolation — those flows must reach shell via `env:` bridges, per
    // GitHub Actions script-injection hardening guidance.
    const lines = text.split('\n');
    const offending = [];
    let inRun = false;
    let runBaseIndent = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const runStart = line.match(/^(\s*)run:\s*\|\s*$/);
      if (runStart) {
        inRun = true;
        runBaseIndent = runStart[1].length;
        continue;
      }
      if (!inRun) continue;
      // End of run block: a non-empty line at indent <= run key's indent.
      const indent = line.match(/^(\s*)\S/);
      if (indent && indent[1].length <= runBaseIndent) {
        inRun = false;
        runBaseIndent = -1;
        // Re-inspect this line in case it opens a new run block.
        i -= 1;
        continue;
      }
      if (/\$\{\{\s*(inputs|needs)\./.test(line)) {
        offending.push(`line ${i + 1}: ${line.trim()}`);
      }
    }
    assert.deepEqual(
      offending,
      [],
      `no \`run:\` script body may interpolate \`\${{ inputs.* }}\` or \`\${{ needs.* }}\` directly — bridge via \`env:\` instead (GitHub Actions script-injection hardening). Offenders:\n${offending.join('\n')}`
    );
  });
});

describe('release-workflow — AC-015 install-smoke registry-replication poll', () => {
  it('test_when_release_yaml_has_install_smoke_job_then_replication_wait_is_a_poll_loop_not_a_fixed_sleep', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'install-smoke');
    assert.ok(block, 'release.yml must declare an `install-smoke` job');
    // The poll loop checks `npm view <pkg>@<v>` until it resolves or times out.
    // A bare `sleep 30` (the prior behavior) is a SEC-LOW reliability hazard:
    // late registry replication produces a false-negative smoke verdict.
    assert.equal(
      /^\s*-\s*name:.*Wait for registry replication\s*$/m.test(block) && /run:\s*sleep\s+30\s*$/m.test(block),
      false,
      'install-smoke must not use a bare `sleep 30` for replication wait; expected a poll-and-timeout loop'
    );
    assert.match(
      block,
      /until\s+npm\s+view\s+"create-baseline@/,
      'install-smoke must poll the registry with `npm view "create-baseline@${NEW_VERSION}"` until it resolves'
    );
    assert.match(
      block,
      /deadline=\$\(\(SECONDS\s*\+\s*\d+\)\)/,
      'install-smoke poll loop must declare an absolute deadline using `SECONDS`'
    );
  });
});

describe('release-workflow — AC-016 build-verify runs action-SHA authenticity verifier', () => {
  it('test_when_release_yaml_has_build_verify_job_then_it_runs_node_scripts_verify_action_shas_before_publish_check', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'build-verify');
    assert.ok(block, 'release.yml must declare a `build-verify` job');
    const steps = subBlock(block, 'steps');
    assert.ok(steps, 'build-verify must have a `steps:` block');
    const verifyIdx = steps.indexOf('node scripts/verify-action-shas.mjs');
    const publishCheckIdx = steps.indexOf('npm run publish:check');
    assert.notEqual(
      verifyIdx,
      -1,
      'build-verify must include a step that runs `node scripts/verify-action-shas.mjs` (closes SEC-MEDIUM SHA-authenticity gap at release time)'
    );
    assert.ok(
      publishCheckIdx === -1 || verifyIdx < publishCheckIdx,
      'verify-action-shas step must run BEFORE `npm run publish:check` so SHA drift fails fast'
    );
  });
});

describe('release-workflow — AC-013 mode extension job gating', () => {
  it('test_when_release_yaml_has_release_only_jobs_then_each_has_if_inputs_mode_release_predicate', () => {
    const text = readReleaseYaml();
    for (const name of ['publish-npm', 'push-bump', 'install-smoke']) {
      const block = jobBlock(text, name);
      assert.ok(block, `release.yml must declare a \`${name}\` job`);
      const ifMatch = block.match(/^\s{4}if:\s*(.+?)\s*$/m);
      assert.ok(
        ifMatch,
        `job \`${name}\` must declare an \`if:\` predicate (mode=release gating)`
      );
      assert.equal(
        ifMatch[1].trim(),
        "inputs.mode == 'release'",
        `job \`${name}\` must declare \`if: inputs.mode == 'release'\`; got: ${ifMatch[1]}`
      );
    }
  });

  it('test_when_release_yaml_has_deploy_pages_job_then_if_predicate_runs_on_publish_success_or_skipped', () => {
    const text = readReleaseYaml();
    const block = jobBlock(text, 'deploy-pages');
    assert.ok(block, 'release.yml must declare a `deploy-pages` job');
    const ifMatch = block.match(/^\s{4}if:\s*(.+?)\s*$/m);
    assert.ok(
      ifMatch,
      'deploy-pages must declare an `if:` predicate (docs-only mode runs deploy-pages even when publish-npm is skipped)'
    );
    const pred = ifMatch[1];
    assert.match(
      pred,
      /always\(\)/,
      'deploy-pages.if must include `always()` so it evaluates even when needs has a skipped job'
    );
    assert.match(
      pred,
      /needs\.publish-npm\.result\s*==\s*'success'/,
      "deploy-pages.if must include `needs.publish-npm.result == 'success'` (release-mode gate)"
    );
    assert.match(
      pred,
      /needs\.publish-npm\.result\s*==\s*'skipped'/,
      "deploy-pages.if must include `needs.publish-npm.result == 'skipped'` (docs-only-mode allowance)"
    );
    assert.match(
      pred,
      /needs\.build-verify\.result\s*==\s*'success'/,
      "deploy-pages.if must include `needs.build-verify.result == 'success'` so a failed build-verify (e.g., missing pages artifact) does not let deploy-pages attempt a deploy"
    );
  });

  it('test_when_release_yaml_has_bump_step_then_it_is_gated_by_inputs_mode_release', () => {
    const text = readReleaseYaml();
    const build = jobBlock(text, 'build-verify');
    assert.ok(build, 'release.yml must declare a `build-verify` job');
    const steps = subBlock(build, 'steps');
    assert.ok(steps, 'build-verify must have a `steps:` block');
    // Locate the step with `id: bump` and confirm an `if:` predicate
    // applies inputs.mode == 'release' (so docs-only skips the mutation
    // of package.json).
    const lines = steps.split('\n');
    const bumpIdIdx = lines.findIndex((l) => /^\s*-?\s*id:\s*bump\s*$/.test(l));
    assert.notEqual(bumpIdIdx, -1, 'build-verify must have a step with `id: bump`');
    // Scan within a 10-line window around the `id: bump` line for the `if:`
    // predicate (the step's keys are siblings; order is not guaranteed).
    const windowStart = Math.max(0, bumpIdIdx - 5);
    const windowEnd = Math.min(lines.length, bumpIdIdx + 6);
    const stepWindow = lines.slice(windowStart, windowEnd).join('\n');
    assert.match(
      stepWindow,
      /if:\s*inputs\.mode\s*==\s*'release'/,
      "bump step must declare `if: inputs.mode == 'release'` so docs-only mode is a no-op for the bump"
    );
  });
});
