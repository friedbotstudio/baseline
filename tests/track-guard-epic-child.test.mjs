// Tests for the epic-child inherited-satisfaction gate in track_guard.mjs (seed §18.9).
//
// Drives track_guard.mjs via spawnSync with synthetic stdin payloads, in a temp
// CLAUDE_PROJECT_DIR (NOT this repo's live dir) so workflow/epic state is isolated.
// The gate must BLOCK every non-state write for an `epic-child` workflow until the
// named epic's discovery is verifiably real.
//
// Authorization is DERIVED from the unforgeable spec_approvals/<epic>.approval token
// at read time, NOT from the epic-state `approved` boolean (which a Bash cd-relative
// write could forge). The boolean is retired from the authorization path.
//
// Coverage:
//   - forged child (no epic named)                         -> deny
//   - epic state missing                                   -> deny
//   - epic state unparseable                               -> deny
//   - forged approved:true but NO token (the bypass)       -> deny
//   - token present + approved:true + pins resolve         -> allow
//   - token present + approved:false + pins resolve        -> allow (boolean retired)
//   - token present + approved field absent + pins resolve -> allow (boolean retired)
//   - token present + approved:true but a pin dangles      -> deny
//   - .claude/state recovery write                         -> allow (gate exempt)
//   - non-epic-child track (tdd-quickfix)                  -> allow (gate does not apply)

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUARD = join(REPO_ROOT, '.claude/hooks/track_guard.mjs');
const LIB_DIR = join(REPO_ROOT, '.claude/hooks/lib');

const SANDBOXES = [];

const PROJECT_JSON = {
  configured: true,
  workflow: {
    phases: ['intake', 'scout', 'research', 'spec', 'approve-spec', 'tdd', 'simplify', 'security', 'integrate', 'document', 'archive', 'memory-sync', 'grant-commit', 'commit'],
    artifacts: {
      intake: 'docs/intake/*.md',
      scout: 'docs/scout/*.md',
      research: 'docs/research/*.md',
      spec: 'docs/specs/*.md',
    },
  },
};

// Build a temp project dir with the guard + lib, a project.json, and a state dir.
// Options:
//   workflow      — workflow.json contents
//   epicState     — object written as JSON to .claude/state/epic/<epic>.json
//   rawEpicState  — { epic, text } written verbatim (for the unparseable-JSON case);
//                   takes precedence over epicState
//   pins          — list of pinned artifact paths to materialize so they resolve
//   token         — epic slug to mint a spec_approvals/<slug>.approval token for
function buildSandbox({ workflow, epicState, rawEpicState = null, pins = [], token = null }) {
  const root = mkdtempSync(join(tmpdir(), 'trackg-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  cpSync(GUARD, join(root, '.claude/hooks/track_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(PROJECT_JSON, null, 2));
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify(workflow, null, 2));
  if (rawEpicState) {
    writeFileSync(join(root, `.claude/state/epic/${rawEpicState.epic}.json`), rawEpicState.text);
  } else if (epicState) {
    writeFileSync(join(root, `.claude/state/epic/${epicState.epic}.json`), JSON.stringify(epicState, null, 2));
  }
  if (token) {
    mkdirSync(join(root, '.claude/state/spec_approvals'), { recursive: true });
    writeFileSync(join(root, `.claude/state/spec_approvals/${token}.approval`), 'APPROVED\n');
  }
  // Materialize any pinned artifact files that should resolve.
  for (const p of pins) {
    const abs = join(root, p);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, '# pinned\n');
  }
  SANDBOXES.push(root);
  return root;
}

// Run the guard with a Write payload for `relFile`. Returns { denied, stdout }.
function runGuard(root, relFile) {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, relFile) } });
  const res = spawnSync('node', [join(root, '.claude/hooks/track_guard.mjs')], {
    input: payload,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  const denied = res.stdout.includes('"permissionDecision":"deny"');
  return { denied, stdout: res.stdout, status: res.status };
}

const childWorkflow = (overrides = {}) => ({
  track_id: 'epic-child',
  slug: 'child-a',
  epic: 'demo-epic',
  slice: 'A',
  pinned_artifacts: {
    scout: 'docs/scout/demo-epic.md',
    research: 'docs/research/demo-epic.md',
    spec: 'docs/specs/demo-epic.md#slice-A',
  },
  exceptions: ['intake', 'scout', 'research', 'spec', 'approve-spec', 'simplify', 'security', 'document'],
  completed: [],
  ...overrides,
});

const approvedEpic = (approved = true) => ({
  epic: 'demo-epic',
  spec: 'docs/specs/demo-epic.md',
  scout: 'docs/scout/demo-epic.md',
  research: 'docs/research/demo-epic.md',
  slices: [{ id: 'A', title: 'slice a', acs: ['AC-001'], risk: [] }],
  approved,
  children: [],
});

// An epic state object with NO `approved` key at all.
const epicWithoutApprovedField = () => {
  const es = approvedEpic(true);
  delete es.approved;
  return es;
};

const ALL_PINS = ['docs/scout/demo-epic.md', 'docs/research/demo-epic.md', 'docs/specs/demo-epic.md'];

after(() => { for (const s of SANDBOXES) rmSync(s, { recursive: true, force: true }); });

describe('track_guard epic-child inherited-satisfaction gate (§18.9)', () => {
  it('blocks a forged child that names no epic', () => {
    const root = buildSandbox({ workflow: childWorkflow({ epic: '' }) });
    assert.equal(runGuard(root, 'src/foo.js').denied, true);
  });

  it('AC-005: blocks when the epic state file is missing', () => {
    const root = buildSandbox({ workflow: childWorkflow(), token: 'demo-epic', pins: ALL_PINS });
    assert.equal(runGuard(root, 'src/foo.js').denied, true);
  });

  it('AC-005: blocks when the epic state file is present but unparseable', () => {
    const root = buildSandbox({
      workflow: childWorkflow(),
      rawEpicState: { epic: 'demo-epic', text: '{ not valid json' },
      token: 'demo-epic',
      pins: ALL_PINS,
    });
    assert.equal(runGuard(root, 'src/foo.js').denied, true);
  });

  it('AC-001 / AC-004: blocks a forged approved:true when NO approval token exists (closes the cd/pushd bypass)', () => {
    // The pre-fix behavior trusted approved:true and ALLOWED this; deriving from the
    // token instead means a forged flag with no real gate-A token is denied.
    const root = buildSandbox({ workflow: childWorkflow(), epicState: approvedEpic(true), pins: ALL_PINS });
    assert.equal(runGuard(root, 'src/foo.js').denied, true);
  });

  it('AC-002: allows when the token is present, approved:true, and every pin resolves', () => {
    const root = buildSandbox({ workflow: childWorkflow(), epicState: approvedEpic(true), token: 'demo-epic', pins: ALL_PINS });
    assert.equal(runGuard(root, 'src/foo.js').denied, false);
  });

  it('AC-003: allows when the token is present even though approved is false (boolean retired)', () => {
    const root = buildSandbox({ workflow: childWorkflow(), epicState: approvedEpic(false), token: 'demo-epic', pins: ALL_PINS });
    assert.equal(runGuard(root, 'src/foo.js').denied, false);
  });

  it('AC-003: allows when the token is present even though the approved field is absent (boolean retired)', () => {
    const root = buildSandbox({ workflow: childWorkflow(), epicState: epicWithoutApprovedField(), token: 'demo-epic', pins: ALL_PINS });
    assert.equal(runGuard(root, 'src/foo.js').denied, false);
  });

  it('AC-002: blocks when the token is present but a pinned artifact dangles', () => {
    // Only scout + research exist; the spec pin is absent.
    const root = buildSandbox({ workflow: childWorkflow(), epicState: approvedEpic(true), token: 'demo-epic', pins: ['docs/scout/demo-epic.md', 'docs/research/demo-epic.md'] });
    assert.equal(runGuard(root, 'src/foo.js').denied, true);
  });

  it('exempts .claude/state recovery writes even when the gate would fail', () => {
    const root = buildSandbox({ workflow: childWorkflow({ epic: '' }) });
    assert.equal(runGuard(root, '.claude/state/workflow.json').denied, false);
  });

  it('does not apply to non-epic-child tracks', () => {
    const root = buildSandbox({ workflow: { track_id: 'tdd-quickfix', slug: 'qf', exceptions: ['intake', 'scout', 'research', 'spec', 'approve-spec'], completed: [] } });
    assert.equal(runGuard(root, 'src/foo.js').denied, false);
  });
});
