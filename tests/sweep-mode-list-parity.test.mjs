// The `--mode {...}` usage line and MODE_DISPATCH are two copies of one list.
//
// They diverged: `backlog-decay` shipped as a fifth mode, the usage comment kept
// saying four, and the landmark describing sweep.mjs inherited the wrong count from
// the comment. Nothing failed, because a comment cannot go red.
//
// The mode list is read from the RUNTIME rather than parsed out of the source table,
// so this compares documentation against what the dispatcher actually accepts.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const SWEEP_REL = '.claude/skills/memory-sync/sweep.mjs';
let sweep;

before(async () => {
  sweep = await tryImport(SWEEP_REL);
  assert.ok(sweep, `${SWEEP_REL} must import cleanly`);
});

// resolveMode throws UnknownModeError naming every legal mode, so the dispatcher
// reports its own key set without the table needing to be exported.
function modesFromRuntime() {
  try {
    sweep.runSweep({ mode: '__not_a_real_mode__', rootDir: REPO_ROOT, memoryDir: join(REPO_ROOT, '.claude/memory') });
  } catch (err) {
    const m = /must be one of ([^;]+);/.exec(err.message);
    assert.ok(m, `the unknown-mode error must name the legal modes; got: ${err.message}`);
    return new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  assert.fail('an unknown mode must throw rather than resolve');
}

function modesFromUsageComment() {
  const src = readFileSync(join(REPO_ROOT, SWEEP_REL), 'utf8');
  const m = /^\/\/\s+--mode \{([^}]+)\}/m.exec(src);
  assert.ok(m, 'sweep.mjs must carry a `--mode {...}` usage line');
  return new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

describe('sweep --mode usage line equals the dispatch table', () => {
  it('test_when_usage_line_compared_to_dispatch_table_then_the_sets_are_equal', () => {
    const documented = modesFromUsageComment();
    const dispatched = modesFromRuntime();
    assert.deepEqual(
      [...documented].sort(), [...dispatched].sort(),
      'the usage comment and MODE_DISPATCH must name the same modes',
    );
  });

  it('test_when_backlog_decay_is_dispatched_then_the_usage_line_names_it', () => {
    // The specific divergence this test was written for. Kept as its own case so a
    // regression names the mode rather than only printing a set difference.
    assert.ok(modesFromRuntime().has('backlog-decay'), 'backlog-decay must be dispatchable');
    assert.ok(modesFromUsageComment().has('backlog-decay'), 'the usage line must name backlog-decay');
  });
});
