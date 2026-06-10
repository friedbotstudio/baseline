// Tests for epic_approval_guard.mjs — structurally gate the epic `approved: true`
// flip against the persistent, forge-proof spec_approvals/<slug>.approval token
// (spec: docs/specs/harden-epic-approved-flip.md, Candidate B / B1).
//
// Drives the guard via spawnSync with synthetic stdin payloads in a temp
// CLAUDE_PROJECT_DIR (NOT this repo's live dir) so epic/token state is isolated.
// Mirrors the fixture style of tests/track-guard-epic-child.test.mjs.
//
// Coverage (1:1 with the spec ACs):
//   AC-001  approved:true write, no token                 -> deny
//   AC-002  approved:true write, matching token present   -> allow
//   AC-003  forged token write (no consent marker)        -> denied by spec_approval_guard (chain)
//   AC-004  non-approved epic-state write (children[])    -> allow (no transition)
//   AC-005  matching token written long ago (no TTL)      -> allow
//   AC-001  slug mismatch (token alpha, write beta)        -> deny  (boundary)
//   AC-001/002  Edit-path transition via computeProposedContent -> gated
//   AC-004  write outside epic-state path                  -> allow (no-op)
//   (State) idempotent re-write of an already-approved epic -> allow (no transition)
//   AC-007  governance lockstep: hook on disk + wired + in EXPECTED_HOOKS, count 23

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EPIC_GUARD = join(REPO_ROOT, '.claude/hooks/epic_approval_guard.mjs');
const SPEC_GUARD = join(REPO_ROOT, '.claude/hooks/spec_approval_guard.mjs');
const TRACK_GUARD = join(REPO_ROOT, '.claude/hooks/track_guard.mjs');
const LIB_DIR = join(REPO_ROOT, '.claude/hooks/lib');

const SANDBOXES = [];
const PROJECT_JSON = { configured: true, consent: { gate_marker_ttl_seconds: 120 } };

// Build a temp project dir with the guard(s) + lib + project.json + state dirs.
function buildSandbox({ epicSlug, epicState, token, tokenAgeSec, guards = [EPIC_GUARD] }) {
  const root = mkdtempSync(join(tmpdir(), 'epicg-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  mkdirSync(join(root, '.claude/state/spec_approvals'), { recursive: true });
  for (const g of guards) cpSync(g, join(root, '.claude/hooks', g.split('/').pop()));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(PROJECT_JSON, null, 2));
  if (epicState) {
    writeFileSync(join(root, `.claude/state/epic/${epicSlug}.json`), JSON.stringify(epicState, null, 2));
  }
  if (token) {
    const tokPath = join(root, `.claude/state/spec_approvals/${token}.approval`);
    writeFileSync(tokPath, 'APPROVED\n1700000000\n/abs/spec.md\nN/A\n');
    if (Number.isFinite(tokenAgeSec)) {
      const when = new Date(Date.now() - tokenAgeSec * 1000);
      utimesSync(tokPath, when, when);
    }
  }
  SANDBOXES.push(root);
  return root;
}

// Run a guard with a payload. Returns { denied, status, stdout }.
function runGuard(root, guardFile, payload) {
  const res = spawnSync('node', [join(root, '.claude/hooks', guardFile)], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { denied: res.stdout.includes('"permissionDecision":"deny"'), status: res.status, stdout: res.stdout };
}

// Convenience: a Write payload to the epic state file with the given object content.
const writeEpic = (root, slug, obj) => ({
  tool_name: 'Write',
  tool_input: { file_path: join(root, `.claude/state/epic/${slug}.json`), content: JSON.stringify(obj, null, 2) },
});

const epic = (approved, extra = {}) => ({
  epic: 'demo-epic', spec: 'docs/specs/demo-epic.md', scout: 'docs/scout/demo-epic.md',
  research: 'docs/research/demo-epic.md', slices: [{ id: 'A', acs: ['AC-001'], risk: [] }],
  approved, children: [], updated_at: 1700000000, ...extra,
});

after(() => { for (const s of SANDBOXES) rmSync(s, { recursive: true, force: true }); });

describe('epic_approval_guard — write-time gate against the persistent approval token', () => {
  it('AC-001: denies approved:true write when no token exists', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false) });
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'demo-epic', epic(true))).denied, true);
  });

  it('AC-002: allows approved:true write when the matching token exists', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false), token: 'demo-epic' });
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'demo-epic', epic(true))).denied, false);
  });

  it('AC-003: forged approval token (no consent marker) is denied by spec_approval_guard', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', guards: [SPEC_GUARD] });
    const forge = {
      tool_name: 'Write',
      tool_input: { file_path: join(root, '.claude/state/spec_approvals/demo-epic.approval'), content: 'APPROVED\n1\n' },
    };
    assert.equal(runGuard(root, 'spec_approval_guard.mjs', forge).denied, true);
  });

  it('AC-004: allows a non-approved epic-state write (children[] append, approved stays false)', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false) });
    const withChild = epic(false, { children: [{ slice: 'A', slug: 'child-a', status: 'open' }] });
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'demo-epic', withChild)).denied, false);
  });

  it('AC-005: allows approved:true write when the matching token is old (no TTL on a durable approval)', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false), token: 'demo-epic', tokenAgeSec: 86400 * 30 });
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'demo-epic', epic(true))).denied, false);
  });

  it('AC-001 (boundary): denies when the token slug does not match the epic', () => {
    const root = buildSandbox({ epicSlug: 'beta', epicState: epic(false, { epic: 'beta' }), token: 'alpha' });
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'beta', epic(true, { epic: 'beta' }))).denied, true);
  });

  it('AC-001/002 (edit path): a transition via Edit is detected and gated', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false) });
    const editPayload = () => ({
      tool_name: 'Edit',
      tool_input: {
        file_path: join(root, '.claude/state/epic/demo-epic.json'),
        old_string: '"approved": false', new_string: '"approved": true',
      },
    });
    // no token -> deny
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', editPayload()).denied, true);
    // with token -> allow
    const root2 = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false), token: 'demo-epic' });
    const edit2 = { tool_name: 'Edit', tool_input: { file_path: join(root2, '.claude/state/epic/demo-epic.json'), old_string: '"approved": false', new_string: '"approved": true' } };
    assert.equal(runGuard(root2, 'epic_approval_guard.mjs', edit2).denied, false);
  });

  it('AC-004 (no-op): allows writes outside the epic-state path', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(false) });
    const payload = { tool_name: 'Write', tool_input: { file_path: join(root, 'src/foo.js'), content: 'approved: true' } };
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', payload).denied, false);
  });

  it('(state) allows an idempotent re-write of an already-approved epic (no transition)', () => {
    const root = buildSandbox({ epicSlug: 'demo-epic', epicState: epic(true) });
    // already approved on disk; re-writing approved:true with no token is not a NEW transition
    assert.equal(runGuard(root, 'epic_approval_guard.mjs', writeEpic(root, 'demo-epic', epic(true, { updated_at: 1700000001 }))).denied, false);
  });
});

// AC-006 — track_guard's read side (es.approved === true) is UNCHANGED by this
// work. A legitimately-approved epic still lets a child write (discovery-skip
// honored); an unapproved epic still blocks. This is a regression guard living
// in this change's diff so AC-006 is traceable here, not only in the pre-existing
// track-guard-epic-child suite.
function buildTrackSandbox({ approved }) {
  const root = mkdtempSync(join(tmpdir(), 'epicg-tg-'));
  mkdirSync(join(root, '.claude/hooks/lib'), { recursive: true });
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  cpSync(TRACK_GUARD, join(root, '.claude/hooks/track_guard.mjs'));
  cpSync(LIB_DIR, join(root, '.claude/hooks/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify(PROJECT_JSON, null, 2));
  const workflow = {
    track_id: 'epic-child', slug: 'child-a', epic: 'demo-epic', slice: 'A',
    pinned_artifacts: { scout: 'docs/scout/demo-epic.md', research: 'docs/research/demo-epic.md', spec: 'docs/specs/demo-epic.md#slice-A' },
    exceptions: ['intake', 'scout', 'research', 'spec', 'approve-spec'], completed: [],
  };
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify(workflow, null, 2));
  writeFileSync(join(root, '.claude/state/epic/demo-epic.json'), JSON.stringify(epic(approved), null, 2));
  for (const p of ['docs/scout/demo-epic.md', 'docs/research/demo-epic.md', 'docs/specs/demo-epic.md']) {
    const abs = join(root, p); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, '# pinned\n');
  }
  SANDBOXES.push(root);
  return root;
}

describe('AC-006 — track_guard read side unchanged (regression)', () => {
  it('a legitimately-approved epic still lets a child write (discovery-skip honored)', () => {
    const root = buildTrackSandbox({ approved: true });
    const payload = { tool_name: 'Write', tool_input: { file_path: join(root, 'src/foo.js') } };
    assert.equal(runGuard(root, 'track_guard.mjs', payload).denied, false);
  });
  it('an unapproved epic still blocks the child write (read side still gates)', () => {
    const root = buildTrackSandbox({ approved: false });
    const payload = { tool_name: 'Write', tool_input: { file_path: join(root, 'src/foo.js') } };
    assert.equal(runGuard(root, 'track_guard.mjs', payload).denied, true);
  });
});

describe('epic_approval_guard — governance lockstep (AC-007)', () => {
  it('the hook is on disk, wired in settings.json, and listed in audit EXPECTED_HOOKS with count 23', () => {
    // Hook file exists
    const guardSrc = readFileSync(EPIC_GUARD, 'utf8');
    assert.match(guardSrc, /epic/i);
    // Wired in live settings.json
    const settings = readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8');
    assert.match(settings, /epic_approval_guard\.mjs/);
    // Listed in audit EXPECTED_HOOKS
    const audit = readFileSync(join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs'), 'utf8');
    assert.match(audit, /'epic_approval_guard'/);
    // Canonical count bumped to 23 in the constitution
    const claude = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /23 hooks/);
  });
});
