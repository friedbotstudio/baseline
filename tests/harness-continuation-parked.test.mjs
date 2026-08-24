// T7 — the harness loop cannot be told to stand down.
//
// harness_continuation's rungs test stop_hook_active, the .harness_active marker
// and the harness_state value. None of them represents "something else owns this
// session", so when swarm-dispatch has a wave in flight and the turn ends, Path A
// re-fires the loop into a phase whose predecessor has not finished.
//
// The rejected alternative was a background-work registry the hook consults. Every
// version of that detector fails in the wrong direction: a registry left behind by
// a crashed wave silences the hook forever, with no signal. Declaring beats
// detecting — the thing that knows writes it down.
//
// `parked` is a fourth value of the existing state machine, not a new file and not
// a boolean per blocker. Anything that needs to own the session uses the same verb.
//
// RED until: the hook recognises `parked` explicitly, swarm-dispatch sets and
// clears it, and /harness preflight clears it on rearm.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(REPO_ROOT, '.claude/hooks/harness_continuation.mjs');

function runHook(state, { marker = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'parked-'));
  try {
    mkdirSync(join(root, '.claude/state'), { recursive: true });
    writeFileSync(join(root, '.claude/state/harness_state'), JSON.stringify(state));
    writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ slug: state.slug }));
    if (marker) writeFileSync(join(root, '.claude/state/.harness_active'), state.slug);

    const stdout = execFileSync('node', [HOOK], {
      input: JSON.stringify({ hook_event_name: 'Stop' }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
    });
    const log = readFileSync(join(root, '.claude/state/logs/harness_continuation.log'), 'utf8');
    return { stdout: stdout.trim(), log };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('AC-014 — a parked harness emits no continuation prompt', () => {
  it('test_when_the_state_is_parked_then_no_continuation_prompt_is_emitted', () => {
    const { stdout } = runHook({ state: 'parked', slug: 's', reason: 'swarm wave 1 in flight' });
    assert.doesNotMatch(stdout, /"decision"\s*:\s*"block"/, 'a parked loop must not be re-fired');
  });

  it('test_when_the_state_is_parked_then_the_marker_does_not_override_it', () => {
    // Path A's rungs are marker + state=continue. Parked has to beat a present
    // marker, because swarm-dispatch runs INSIDE an armed loop — the marker is
    // there by definition.
    const withMarker = runHook({ state: 'parked', slug: 's', reason: 'r' }, { marker: true });
    const without = runHook({ state: 'parked', slug: 's', reason: 'r' }, { marker: false });
    for (const { stdout } of [withMarker, without]) {
      assert.doesNotMatch(stdout, /"decision"\s*:\s*"block"/);
    }
  });

  it('test_when_the_state_is_parked_then_the_log_names_parked_rather_than_an_unknown_state', () => {
    // Today an unrecognised state falls into the catch-all silent branch, so
    // parked would "work" by accident. Recognising it explicitly is what stops a
    // future refactor of that branch from silently re-arming a parked loop.
    const { log } = runHook({ state: 'parked', slug: 's', reason: 'swarm wave 1 in flight' });
    assert.match(log, /parked/i, 'the log must show parked was recognised, not merely unmatched');
    assert.doesNotMatch(log, /not "continue" or "yielded"/, 'parked is a known state, not a fallthrough');
  });
});

describe('AC-014 (safety direction) — the other three states are untouched', () => {
  it('test_when_the_state_is_continue_with_a_marker_then_path_a_still_fires', () => {
    const { stdout } = runHook({ state: 'continue', slug: 's', reason: 'r' });
    assert.match(stdout, /"decision"\s*:\s*"block"/, 'Path A is unchanged');
  });

  it('test_when_the_state_is_done_then_it_stays_silent', () => {
    const { stdout } = runHook({ state: 'done', slug: 's', reason: 'r' });
    assert.doesNotMatch(stdout, /"decision"\s*:\s*"block"/);
  });
});

describe('AC-018 — the writers and the readers agree on the fourth state', () => {
  const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

  it('test_when_swarm_dispatch_is_read_then_it_parks_before_the_barrier_and_clears_on_every_exit', () => {
    const dispatch = read('.claude/skills/swarm-dispatch/SKILL.md');
    assert.match(dispatch, /parked/, 'swarm-dispatch must park the harness before dispatching a wave');
    assert.match(
      dispatch,
      /unpark|clear .{0,40}park|park.{0,40}clear/i,
      'and must clear it on the way out — success, failure, and abort'
    );
  });

  it('test_when_the_harness_skill_is_read_then_it_documents_four_states_and_clears_park_on_rearm', () => {
    const harness = read('.claude/skills/harness/SKILL.md');
    assert.match(harness, /four states/i, 'the state machine is documented as four, not three');
    assert.match(harness, /parked/, 'and names the fourth');
    assert.doesNotMatch(
      harness,
      /one of three states/i,
      'the stale three-state claim must be gone, not merely added to'
    );
  });

  it('test_when_the_seed_is_read_then_the_hook_row_names_parked', () => {
    for (const rel of ['docs/init/seed.md', 'src/seed.template.md']) {
      assert.match(read(rel), /parked/, `${rel} §4.1 must name the fourth state`);
    }
  });
});
