// Tests for src/cli/diff-render.js — colorized unified-diff helper used by
// the tier-1 "Show diff" prompt. RED until the module exists.
// See docs/specs/upgrade-flow-rework.md §Behavior #1, AC-001.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let diffRender;
try {
  diffRender = await import('../src/cli/diff-render.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/diff-render.js: ${err.message}`);
}

const { renderUnifiedDiff } = diffRender;

describe('diff-render — renderUnifiedDiff', () => {
  it('test_when_renderUnifiedDiff_then_lines_prefixed_with_plus_minus_space', () => {
    const local = 'line one\nline two\nline three\n';
    const incoming = 'line one\nline two CHANGED\nline three\n';

    const out = renderUnifiedDiff(local, incoming, { colorize: false });

    const lines = out.split('\n');
    assert.ok(lines.some((l) => l.startsWith('-line two')),
      `expected a removed-line marker "-line two" in unified diff output; got:\n${out}`);
    assert.ok(lines.some((l) => l.startsWith('+line two CHANGED')),
      `expected an added-line marker "+line two CHANGED" in unified diff output; got:\n${out}`);
    assert.ok(lines.some((l) => l.startsWith(' line one')),
      `expected a context-line marker " line one" in unified diff output; got:\n${out}`);
  });

  it('test_when_renderUnifiedDiff_with_colorize_true_then_ansi_codes_present', () => {
    const local = 'a\nb\nc\n';
    const incoming = 'a\nB\nc\n';

    const out = renderUnifiedDiff(local, incoming, { colorize: true });

    // ANSI SGR escape for any color: ESC [ <digits> m
    assert.ok(/\[\d+m/.test(out),
      `colorize:true must emit ANSI escape codes; got:\n${out}`);
  });

  it('test_when_renderUnifiedDiff_with_colorize_false_then_no_ansi', () => {
    const local = 'a\nb\nc\n';
    const incoming = 'a\nB\nc\n';

    const out = renderUnifiedDiff(local, incoming, { colorize: false });

    assert.ok(!/\[/.test(out),
      `colorize:false must NOT emit ANSI escape codes; got:\n${out}`);
  });
});
