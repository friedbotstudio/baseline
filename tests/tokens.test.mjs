// Tests for src/cli/tui/tokens.js — Foundation brand-color helpers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let tokens;
try {
  tokens = await import('../src/cli/tui/tokens.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/tokens.js: ${err.message}`);
}

describe('tui/tokens', () => {
  it('exposes the six brand-color functions named after their role', () => {
    for (const name of ['accent', 'accentLight', 'muted', 'success', 'warn', 'error', 'rule']) {
      assert.equal(typeof tokens[name], 'function', `${name} must be a function`);
      const out = tokens[name]('hi');
      assert.equal(typeof out, 'string', `${name}('hi') must return a string`);
      assert.ok(out.includes('hi'), `${name}('hi') must contain the input text`);
    }
  });
});
