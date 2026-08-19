// AC-006 + AC-010 — the terminal sanitizer, hoisted to one module.
//
// The rule under test is an ORDER as much as a transform: controls are replaced
// with a space BEFORE whitespace collapses. A collapse-then-strip implementation
// passes a naive "no ESC in output" assertion and still leaves the double space
// the control used to occupy, so the order is asserted directly.
//
// AC-010's assertions read the two pre-existing consumers as text. A shared
// module with the old copies still in place is the one outcome the backlog entry
// names as worse than either state alone, so "nobody kept a local copy" is the
// contract, not a style preference.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const TERMINAL_TEXT = '.claude/skills/lib/terminal-text.mjs';
const STANDUP_RENDER = '.claude/skills/standup/render.mjs';
const BACKLOG_DEFERRAL = '.claude/skills/harness/checkers/backlog-deferral.mjs';

const WIDTH = 96;
const CONTROL_CLASS_LITERAL = 'u0000-\\u001f';

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('terminal-text — the shared sanitizer', () => {
  it('test_when_a_title_carries_esc_and_bel_then_controls_are_replaced_before_whitespace_collapses', async () => {
    const mod = await tryImport(TERMINAL_TEXT);
    assert.ok(mod, `${TERMINAL_TEXT} must exist — the hoisted sanitizer this AC pins`);

    const out = mod.clip('a\u001b[31m\u0007  b');

    assert.ok(!new RegExp('[\\u0000-\\u001f\\u007f-\\u009f]', 'u').test(out), 'no C0/C1 character may survive');
    assert.equal(
      out,
      'a [31m b',
      'controls become a space FIRST, then the collapse absorbs the gap — a collapse-then-strip order leaves a double space here',
    );
  });

  it('test_when_text_is_exactly_the_width_then_it_renders_unchanged', async () => {
    const mod = await tryImport(TERMINAL_TEXT);
    assert.ok(mod, `${TERMINAL_TEXT} must exist`);

    const exact = 'x'.repeat(WIDTH);

    assert.equal(mod.clip(exact), exact, 'the boundary case is inclusive — 96 characters is not too long');
  });

  it('test_when_text_exceeds_the_width_then_it_truncates_to_the_width_with_an_ellipsis', async () => {
    const mod = await tryImport(TERMINAL_TEXT);
    assert.ok(mod, `${TERMINAL_TEXT} must exist`);

    const out = mod.clip('y'.repeat(1000));

    assert.equal(out.length, WIDTH, 'the clipped string is exactly the width, ellipsis included');
    assert.ok(out.endsWith('…'), 'truncation is marked, never silent');
  });

  it('test_when_a_title_contains_newlines_then_it_renders_as_one_line', async () => {
    const mod = await tryImport(TERMINAL_TEXT);
    assert.ok(mod, `${TERMINAL_TEXT} must exist`);

    const out = mod.clip('first line\n  continuation captured by parse.mjs\n  another');

    assert.ok(!out.includes('\n'), 'one row renders as one line — parse.mjs folds continuations into body');
    assert.equal(out, 'first line continuation captured by parse.mjs another');
  });

  it('test_when_clip_receives_null_or_undefined_or_a_number_then_it_returns_a_string', async () => {
    const mod = await tryImport(TERMINAL_TEXT);
    assert.ok(mod, `${TERMINAL_TEXT} must exist`);

    assert.equal(mod.clip(null), '');
    assert.equal(mod.clip(undefined), '');
    assert.equal(mod.clip(42), '42');
  });

  it('test_when_the_sanitizer_is_hoisted_then_no_consumer_declares_a_local_control_char_rule', () => {
    const consumers = [STANDUP_RENDER, BACKLOG_DEFERRAL];

    for (const rel of consumers) {
      const text = read(rel);
      assert.ok(
        text.includes('terminal-text.mjs'),
        `${rel} must import the shared sanitizer`,
      );
      assert.ok(
        !text.includes(CONTROL_CLASS_LITERAL),
        `${rel} still declares its own control-character class — a shared module with the old copies in place is worse than either state alone`,
      );
    }
  });
});
