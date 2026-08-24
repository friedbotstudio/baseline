// T4 — hard-block patterns match anywhere in the command string.
//
// Reported from a consumer install as one instance (the power-state verbs) and
// verified here as a class: destructive_cmd_guard.mjs:28-37 runs
// `new RegExp(p).test(cmd)` against the WHOLE command string, so a read-only
// command that merely CONTAINS a destructive verb is hard-blocked. Two of the
// eight patterns are confirmed live (5: the power-state verbs, 4: mkfs); only
// patterns 0 and 1 (the rm pair) anchor.
//
// Reproduced twice during triage: a `grep` for the word, and a `node -e` whose
// only offence was the word inside a regex literal.
//
// The seam is common.mjs rather than the guard, so these run without the guard's
// top-level payload read — same reason tests/destructive-guard-residuals.test.mjs
// tests `writesConsentPath` there.
//
// RED until: common.mjs exports `effectiveCommands` and `cmdMatchesAny`, the
// guard calls them per segment, and the verb patterns are anchored in BOTH
// .claude/project.json and src/project.template.json.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

function hardBlockPatterns(relPath) {
  const cfg = JSON.parse(readFileSync(join(REPO_ROOT, relPath), 'utf8'));
  return cfg.destructive?.hard_block_patterns ?? [];
}

describe('AC-001 — a read-only command that mentions a destructive verb is allowed', () => {
  it('test_when_a_read_only_command_mentions_a_destructive_verb_then_it_is_allowed', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns('.claude/project.json');

    const allowed = [
      'grep -n "shutdown" docs/architecture/async-patterns.md',
      'grep -n "shutdown\\|deadline\\|backpressure" docs/',
      'node retrieve.mjs --terms "graceful shutdown"',
      'echo "graceful-shutdown" >> notes.md',
      'rg reboot docs/runbook.md',
    ];

    for (const cmd of allowed) {
      assert.equal(
        cmdMatchesAny(cmd, patterns),
        false,
        `read-only command must not be hard-blocked: ${cmd}`
      );
    }
  });
});

describe('AC-002 — a destructive verb at any command head is still hard-blocked', () => {
  // The safety direction of AC-001. Authored together: a suite that only proved
  // grep now passes would rate green on a guard that blocks nothing.
  it('test_when_a_destructive_verb_is_at_a_command_head_then_it_is_blocked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns('.claude/project.json');

    const blocked = [
      'shutdown -h now',
      'reboot',
      'poweroff',
      'halt',
      'make build && reboot',
      'npm test; shutdown -h now',
      'sudo poweroff',
      'env FOO=1 shutdown -r now',
      'sudo -- halt',
    ];

    for (const cmd of blocked) {
      assert.equal(
        cmdMatchesAny(cmd, patterns),
        true,
        `destructive command must remain hard-blocked: ${cmd}`
      );
    }
  });

  it('test_when_the_rm_pair_follows_a_chain_operator_then_it_is_still_blocked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns('.claude/project.json');

    // Per-segment matching STRENGTHENS the rm pair: `^\s*rm\s+` previously only
    // fired at position zero, so a chained rm escaped.
    assert.equal(
      cmdMatchesAny('make build && rm -rf /', patterns),
      true,
      'rm -rf / after a chain operator must be blocked'
    );
  });
});

describe('AC-003 — the mkfs pattern gains the same position-awareness', () => {
  it('test_when_mkfs_is_an_argument_then_allowed_and_when_it_is_a_command_head_then_blocked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns('.claude/project.json');

    assert.equal(
      cmdMatchesAny('grep -rn "mkfs.ext4" docs/filesystems.md', patterns),
      false,
      'a doc grep mentioning mkfs must not be hard-blocked'
    );
    assert.equal(
      cmdMatchesAny('mkfs.ext4 /dev/sdb1', patterns),
      true,
      'mkfs at a command head must remain hard-blocked'
    );
  });
});

describe('AC-004 — the two maintained pattern lists stay identical', () => {
  it('test_when_both_pattern_lists_are_read_then_they_are_identical', () => {
    // The pattern list is dual-maintained: a dev-only fix is template drift and
    // never reaches a consumer install. This is the 2026-08-22 batch's failure
    // mode applied to a config key rather than a track file.
    assert.deepEqual(
      hardBlockPatterns('.claude/project.json'),
      hardBlockPatterns('src/project.template.json'),
      '.claude/project.json and src/project.template.json must hold identical hard_block_patterns'
    );
  });
});

describe('AC-001/002 seam — effectiveCommands strips what a head check must ignore', () => {
  it('test_when_a_command_carries_prefixes_then_effectivecommands_returns_the_real_heads', async () => {
    const { effectiveCommands } = await import(COMMON);

    // Containment, not exact equality. The list carries each executed fragment
    // BOTH raw and prefix-stripped: a `^`-anchored verb pattern needs the
    // stripped form, and a redirect signature needs the raw one. Pinning the
    // exact array would refuse the wrapper coverage AC-023 requires.
    assert.ok(
      effectiveCommands('make build && reboot').includes('reboot'),
      'chain operators split into separate effective commands'
    );
    assert.ok(
      effectiveCommands('sudo poweroff').includes('poweroff'),
      'a prefix word is stripped so the real verb is a head'
    );
    assert.ok(
      effectiveCommands('FOO=1 BAR=2 halt').includes('halt'),
      'env assignments are stripped'
    );
    assert.deepEqual(
      effectiveCommands('grep -n "shutdown" x.md'),
      ['grep -n "shutdown" x.md'],
      'an ordinary command yields itself alone, quotes preserved'
    );
  });

  it('test_when_a_redirect_is_present_then_the_segment_text_survives', async () => {
    const { effectiveCommands } = await import(COMMON);

    // Pattern 6 is a redirect signature, not a verb, so the raw fragment text
    // must survive stripping or that pattern stops matching.
    assert.ok(
      effectiveCommands('echo 1 > /dev/sda').includes('echo 1 > /dev/sda'),
      'redirect text is preserved in the effective command'
    );
  });
});
