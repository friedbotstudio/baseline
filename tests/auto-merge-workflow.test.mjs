// Structural invariants on .github/workflows/auto-merge.yml.
//
// Defends the fix for the MEDIUM finding in
// docs/archive/2026-07-04/erp-portables-slice-j/security.md (backlog key
// `auto-merge-classify-checkout-base-sha-hardening-6836`):
//
//   The `classify-and-enable` job decides whether a PR may auto-merge by running
//   scripts/ci/low-risk-classifier.mjs FROM THE CHECKED-OUT TREE. With an
//   unpinned `actions/checkout`, that tree is the PR merge ref — so a PR that
//   edits the classifier's NEVER-list is classified BY ITS OWN CODE and can
//   wave itself through. Pinning the checkout to the PR's base SHA forces the
//   classifier to always come from the target branch.
//
// The three tests below lock the fix AND the coupling that makes it safe: the
// changed-file list is sourced from the GitHub API (`gh pr diff`), never from
// the working tree — which is precisely why moving the checkout to base.sha
// changes WHICH CLASSIFIER RUNS without changing WHICH DIFF IS CLASSIFIED.
//
// Parsing strategy: no third-party YAML dep (the package's `dependencies`
// invariant is enforced by scripts/check-files-diff.mjs). The file's shape is
// controlled by this project, so line-based indent-aware sub-block extraction is
// sufficient — same approach as tests/release-workflow.test.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTO_MERGE_YML = path.join(REPO_ROOT, '.github/workflows/auto-merge.yml');
const CLASSIFY_JOB = 'classify-and-enable';

// ---------- Foundation: file loader ----------

function readAutoMergeYaml() {
  if (!existsSync(AUTO_MERGE_YML)) {
    throw new Error(`.github/workflows/auto-merge.yml does not exist. Expected at: ${AUTO_MERGE_YML}`);
  }
  return readFileSync(AUTO_MERGE_YML, 'utf8');
}

// ---------- Foundation: YAML sub-block extractors ----------

// The block of lines belonging to a job under `jobs:`. Job header is at indent-2
// (`  <name>:`); its body is indented >= 4.
function jobBlock(text, name) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`  ${name}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex(
    (line, i) => i > startIdx && /^ {0,2}\S/.test(line) && !line.startsWith(`  ${name}:`)
  );
  return (endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx)).join('\n');
}

// Inside a job block, the lines under a named sub-key (`steps:`, `permissions:`).
// Sub-key is at indent-4; body at >= 6.
function subBlock(blockText, subKey) {
  const lines = blockText.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`    ${subKey}:`));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex((line, i) => i > startIdx && /^ {0,4}\S/.test(line));
  return (endIdx === -1 ? lines.slice(startIdx) : lines.slice(startIdx, endIdx)).join('\n');
}

// Split a job's `steps:` block into one chunk per step. Each step starts at an
// indent-6 list dash (`      - `); its continuation lines are indented deeper.
function stepBlocks(jobText) {
  const steps = subBlock(jobText, 'steps');
  if (!steps) return [];
  const chunks = [];
  let current = null;
  for (const line of steps.split('\n').slice(1)) {
    if (/^ {6}-\s/.test(line)) {
      if (current) chunks.push(current.join('\n'));
      current = [line];
    } else if (current && line.trim() !== '') {
      current.push(line);
    }
  }
  if (current) chunks.push(current.join('\n'));
  return chunks;
}

// The single step chunk in a job whose `uses:` is actions/checkout.
function checkoutStep(text, jobName) {
  const block = jobBlock(text, jobName);
  assert.ok(block, `job \`${jobName}\` must exist in auto-merge.yml`);
  const found = stepBlocks(block).filter((chunk) => /uses:\s*actions\/checkout@/.test(chunk));
  assert.equal(
    found.length,
    1,
    `job \`${jobName}\` must declare exactly one actions/checkout step; found ${found.length}`
  );
  return found[0];
}

// ---------- Domain: the classify job runs the BASE branch's classifier ----------

describe('auto-merge — classify job checkout is pinned to the PR base SHA', () => {
  it('test_when_classify_job_parsed_then_checkout_is_pinned_to_base_sha', () => {
    const step = checkoutStep(readAutoMergeYaml(), CLASSIFY_JOB);

    assert.match(
      step,
      /^\s+with:\s*$/m,
      `the \`${CLASSIFY_JOB}\` checkout step must declare a \`with:\` block carrying the ref pin. ` +
        `Without it the checkout defaults to the PR merge ref, so the PR's OWN copy of ` +
        `scripts/ci/low-risk-classifier.mjs decides whether the PR may auto-merge.\nStep was:\n${step}`
    );
    assert.match(
      step,
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/,
      `the \`${CLASSIFY_JOB}\` checkout step must pin \`ref: \${{ github.event.pull_request.base.sha }}\` ` +
        `so the low-risk classifier is always the TARGET branch's copy, never the PR's. ` +
        `A PR editing the classifier's NEVER-list must not be able to classify itself.\nStep was:\n${step}`
    );
  });
});

// ---------- Domain: the pin is meaningful, and stays safe ----------

describe('auto-merge — the classify job invariants the base-SHA pin depends on', () => {
  it('test_when_classify_job_parsed_then_classifier_runs_from_checked_out_tree', () => {
    const block = jobBlock(readAutoMergeYaml(), CLASSIFY_JOB);
    assert.ok(block, `job \`${CLASSIFY_JOB}\` must exist`);

    assert.match(
      block,
      /node\s+scripts\/ci\/low-risk-classifier\.mjs/,
      `\`${CLASSIFY_JOB}\` must invoke \`node scripts/ci/low-risk-classifier.mjs\` — the classifier is a ` +
        `LOCAL file resolved from the checked-out tree, which is the only reason the \`ref:\` pin protects ` +
        `anything. If this ever becomes an inline script or a pinned package, the checkout ref stops being ` +
        `the control and the threat model must be re-derived.`
    );
  });

  it('test_when_classify_job_parsed_then_file_list_comes_from_gh_pr_diff_not_git', () => {
    const block = jobBlock(readAutoMergeYaml(), CLASSIFY_JOB);
    assert.ok(block, `job \`${CLASSIFY_JOB}\` must exist`);

    assert.match(
      block,
      /gh\s+pr\s+diff\b[^\n]*--name-only/,
      `\`${CLASSIFY_JOB}\` must source the changed-file list from \`gh pr diff --name-only\` (the GitHub API). ` +
        `This is what makes the base-SHA checkout safe: the API still reports the PR's diff even though the ` +
        `working tree is now the base branch.`
    );
    assert.equal(
      /git\s+diff\b/.test(block),
      false,
      `\`${CLASSIFY_JOB}\` must NOT derive the changed-file list from a working-tree \`git diff\`. With the ` +
        `checkout pinned to base.sha the working tree has NO PR changes, so a \`git diff\` would yield an ` +
        `empty file list and EVERY PR would classify as low-risk. The API (\`gh pr diff\`) is the only ` +
        `correct source here.`
    );
  });
});
