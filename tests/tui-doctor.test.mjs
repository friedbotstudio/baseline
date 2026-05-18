// Tests for src/cli/tui/doctor.js — branded doctor report renderer.
// RED until the module exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let tuiDoctor;
try {
  tuiDoctor = await import('../src/cli/tui/doctor.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/doctor.js: ${err.message}`);
}

function captureStdout(fn) {
  const captured = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { captured.push(chunk); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured.join('');
}

function syntheticReport(overrides = {}) {
  return {
    exitCode: 0,
    strict: false,
    target: '/tmp/target',
    manifestVersion: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    matched: ['CLAUDE.md', '.mcp.json'],
    customized: [],
    missing: [],
    added: [],
    tampered: [],
    ...overrides,
  };
}

describe('tui/doctor', () => {
  it('test_when_doctor_in_tty_without_json_then_emits_branded_sectioned_report', () => {
    const report = syntheticReport({ matched: ['CLAUDE.md', '.mcp.json'], customized: ['notes.md'] });
    const out = captureStdout(() => tuiDoctor.render(report));

    assert.ok(out.length > 0, 'render must emit at least one chunk to stdout');
    assert.ok(/matched/i.test(out), 'output must mention the matched section');
    assert.ok(/customized/i.test(out), 'output must mention the customized section');
    assert.ok(/missing/i.test(out), 'output must mention the missing section');
    assert.ok(/added/i.test(out), 'output must mention the added section');
    assert.ok(out.includes(String(report.matched.length)), 'matched count must appear in output');
    assert.ok(out.includes(String(report.customized.length)), 'customized count must appear in output');
  });

  it('test_when_doctor_render_invoked_with_error_then_emits_brand_header_then_error_message', () => {
    const out = captureStdout(() => tuiDoctor.render({
      exitCode: 2,
      target: '/tmp/no-manifest-here',
      error: 'No baseline manifest at .claude/.baseline-manifest.json.',
    }));

    assert.ok(out.includes('Baseline doctor'), 'must include brand header even on error path');
    assert.ok(out.includes('/tmp/no-manifest-here'), 'target path must appear in the branded error frame');
    assert.ok(out.includes('doctor:'), 'must include the doctor: marker on the error line');
    assert.ok(out.includes('No baseline manifest'), 'error message body must reach stdout');
    const headerIdx = out.indexOf('Baseline doctor');
    const errIdx = out.indexOf('No baseline manifest');
    assert.ok(headerIdx >= 0 && errIdx > headerIdx, 'brand header must precede the error message');
  });
});
