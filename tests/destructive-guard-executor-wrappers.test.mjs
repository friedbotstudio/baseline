// T4 follow-up — anchoring the verb patterns opened five executor-wrapped bypasses.
//
// The T4 fix anchored the hard-block verb patterns to a command head, which fixed
// the false-positive class. But `effectiveCommands` was built on
// `splitShellSegments` alone: it strips env assignments and PREFIX_EXECUTORS
// (sudo, env, xargs) and knows nothing about `sh -c`, `eval`, subshells, or
// command substitution. So five forms that HEAD hard-blocked started passing.
//
// Measured against the eight live hard_block_patterns before this test was
// written. HEAD blocked all nine probes; the anchored version blocked four.
//
// The AC-002 safety test stayed green because it covered the prefix forms and no
// wrapper form — which is exactly why this file exists.
//
// The fix reuses `executedFragments`, already in common.mjs, which peels `sh -c`,
// `eval`, subshells, brace groups and `$( )` bodies, caps recursion at depth 6,
// and is covered by tests/git-commit-guard-tokenize.test.mjs. Two parsers
// answering "what does this command run" is the drift this repo already has a
// convention against.
//
// RED until: effectiveCommands is built on executedFragments.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = join(REPO_ROOT, '.claude/hooks/lib/common.mjs');

function hardBlockPatterns() {
  return JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'))
    .destructive.hard_block_patterns;
}

describe('AC-023 — an executor-wrapped destructive command is still hard-blocked', () => {
  it('test_when_a_destructive_verb_is_wrapped_in_an_executor_then_it_is_still_blocked', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // Every one of these was blocked at HEAD and passed after the anchoring fix.
    const wrapped = [
      'sh -c "shutdown -h now"',
      "bash -c 'mkfs.ext4 /dev/sda1'",
      'eval "poweroff"',
      '(reboot)',
      'echo $(halt)',
      'zsh -c "reboot"',
      '{ poweroff; }',
      'sudo sh -c "shutdown -r now"',
    ];

    for (const cmd of wrapped) {
      assert.equal(
        cmdMatchesAny(cmd, patterns),
        true,
        `a hard-block verb reached through a wrapper must stay blocked: ${cmd}`
      );
    }
  });

  it('test_when_a_verb_is_quoted_data_rather_than_executed_then_it_is_still_allowed', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // The safety direction, and the whole point of T4. Recursing into executors
    // must not undo the false-positive fix: a verb inside single quotes is data,
    // and `executedFragments` already distinguishes the two (single quotes
    // suppress substitution, double quotes do not).
    const allowed = [
      'grep -n "shutdown" docs/architecture/async-patterns.md',
      "echo 'shutdown is a word'",
      'rg reboot docs/runbook.md',
      'grep -rn "mkfs.ext4" docs/filesystems.md',
      'node retrieve.mjs --terms "graceful shutdown"',
    ];

    for (const cmd of allowed) {
      assert.equal(
        cmdMatchesAny(cmd, patterns),
        false,
        `read-only command must not be hard-blocked: ${cmd}`
      );
    }
  });

  it('test_when_the_prefix_forms_are_rechecked_then_they_are_unchanged', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // Regression guard on what AC-002 already covers, so a rewrite of
    // effectiveCommands cannot fix the wrappers by breaking the prefixes.
    for (const cmd of ['sudo poweroff', 'xargs shutdown', 'FOO=1 halt', 'make x && reboot', 'shutdown -h now']) {
      assert.equal(cmdMatchesAny(cmd, patterns), true, `still blocked: ${cmd}`);
    }
  });

  it('test_when_a_redirect_signature_is_wrapped_then_the_raw_text_still_matches', async () => {
    const { cmdMatchesAny } = await import(COMMON);
    const patterns = hardBlockPatterns();

    // Pattern 6 is a redirect signature, not a verb. Dequoting inside an executor
    // must not lose it.
    assert.equal(cmdMatchesAny('echo 1 > /dev/sda', patterns), true, 'bare redirect blocked');
    assert.equal(cmdMatchesAny('sh -c "echo 1 > /dev/sda"', patterns), true, 'wrapped redirect blocked');
  });
});

describe('AC-023 seam — one fragment list answers "what does this command run"', () => {
  it('test_when_effectivecommands_sees_an_executor_then_it_returns_the_inner_command', async () => {
    const { effectiveCommands } = await import(COMMON);

    assert.ok(
      effectiveCommands('sh -c "shutdown -h now"').includes('shutdown -h now'),
      'the inner command of an executor must appear as an effective command'
    );
    assert.ok(
      effectiveCommands('eval "poweroff"').includes('poweroff'),
      'eval bodies are executed, so they are effective commands'
    );
    assert.ok(
      effectiveCommands('sudo poweroff').includes('poweroff'),
      'prefix stripping still applies'
    );
  });

  it('test_when_common_is_read_then_effectivecommands_reuses_the_shared_fragment_walker', async () => {
    // A second parser answering the same question is the drift the repo's
    // one-rule-one-module convention exists to prevent. gitSegments already
    // reads executedFragments; cmdMatchesAny must read the same list.
    const source = readFileSync(COMMON, 'utf8');
    const fn = source.slice(source.indexOf('export function effectiveCommands'));
    assert.match(
      fn.slice(0, 600),
      /executedFragments/,
      'effectiveCommands must build on executedFragments, not on a second walker'
    );
  });
});
