// maker-checker round-trip — AC-001 (bounded: exactly 1 maker + 1 checker)
// SUT: .claude/skills/harness/maker-checker.mjs (not yet built -> RED).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/maker-checker.mjs');

describe('maker-checker round-trip (AC-001)', () => {
  it('test_when_roundtrip_configured_two_checkers_then_throws', async () => {
    const { assertBounded } = await import(SUT);
    assert.throws(() => assertBounded({ makers: 1, checkers: 2 }), /one maker.*one checker|bounded/i);
  });

  it('test_when_roundtrip_configured_two_makers_then_throws', async () => {
    const { assertBounded } = await import(SUT);
    assert.throws(() => assertBounded({ makers: 2, checkers: 1 }), /one maker.*one checker|bounded/i);
  });

  it('test_when_roundtrip_configured_one_each_then_ok', async () => {
    const { assertBounded } = await import(SUT);
    assert.doesNotThrow(() => assertBounded({ makers: 1, checkers: 1 }));
  });
});
