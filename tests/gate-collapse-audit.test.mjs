// Governance-lockstep tests for the gate-collapse rename (AC-005, AC-006).
//
// D-1: spec_approval_guard is RENAMED to direction_approval_guard — a rename
// cascade, never a count cascade. Hook count stays 26; command count stays 6.
// The old names must be fully gone from the expected-baseline registry AND disk,
// and the new names present, so audit-baseline stays green.
//
// FAILS until expected-baseline.mjs, the hook file, the command file, and
// settings.json are all renamed in lockstep.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { EXPECTED_HOOKS, EXPECTED_COMMANDS } = await import(path.join(REPO_ROOT, '.claude/skills/audit-baseline/expected-baseline.mjs'));

describe('gate-collapse rename — governance lockstep (AC-005)', () => {
  it('test_when_expected_hooks_read_then_direction_guard_present_spec_guard_absent', () => {
    assert.ok(EXPECTED_HOOKS.has('direction_approval_guard'), 'direction_approval_guard must be registered');
    assert.ok(!EXPECTED_HOOKS.has('spec_approval_guard'), 'spec_approval_guard must be gone (renamed)');
  });

  it('test_when_hook_count_read_then_still_26', () => {
    assert.equal(EXPECTED_HOOKS.size, 26, 'rename is count-neutral — hook count stays 26');
  });

  it('test_when_expected_commands_read_then_approve_direction_present_approve_spec_absent', () => {
    assert.ok(EXPECTED_COMMANDS.has('approve-direction'), 'approve-direction command must be registered');
    assert.ok(!EXPECTED_COMMANDS.has('approve-spec'), 'approve-spec command must be gone (renamed, no alias per Open Question 2)');
  });

  it('test_when_command_count_read_then_still_6', () => {
    assert.equal(EXPECTED_COMMANDS.size, 6, 'command rename is count-neutral');
  });

  it('test_when_disk_checked_then_direction_guard_file_present_spec_guard_gone', () => {
    assert.ok(existsSync(path.join(REPO_ROOT, '.claude/hooks/direction_approval_guard.mjs')), 'renamed hook file must exist');
    assert.ok(!existsSync(path.join(REPO_ROOT, '.claude/hooks/spec_approval_guard.mjs')), 'old hook file must be removed');
  });

  it('test_when_disk_checked_then_approve_direction_command_present_approve_spec_gone', () => {
    assert.ok(existsSync(path.join(REPO_ROOT, '.claude/commands/approve-direction.md')), 'renamed command must exist');
    assert.ok(!existsSync(path.join(REPO_ROOT, '.claude/commands/approve-spec.md')), 'old command must be removed');
  });

  it('test_when_settings_read_then_wires_direction_guard_not_spec_guard', () => {
    const settings = readFileSync(path.join(REPO_ROOT, '.claude/settings.json'), 'utf8');
    assert.ok(settings.includes('direction_approval_guard'), 'settings.json must wire the renamed guard');
    assert.ok(!settings.includes('spec_approval_guard'), 'settings.json must not reference the old guard name');
  });

  it('test_when_direction_marker_const_read_then_defined', async () => {
    const common = await import(path.join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));
    assert.equal(typeof common.CONSENT_MARKER_DIRECTION, 'string');
    assert.ok(common.CONSENT_MARKER_DIRECTION.endsWith('.direction_approval_grant'));
    assert.equal(common.CONSENT_MARKER_DIRECTION_REL, '.claude/state/.direction_approval_grant');
  });
});
