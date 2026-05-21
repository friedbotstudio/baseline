// Tests for src/cli/tui/meta.js — branded help / version renderers.
// RED until the module exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let meta;
try {
  meta = await import('../src/cli/tui/meta.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/meta.js: ${err.message}`);
}

function captureStdout(fn) {
  const captured = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { captured.push(chunk); return true; };
  try { fn(); } finally { process.stdout.write = origWrite; }
  return captured.join('');
}

describe('tui/meta', () => {
  it('test_when_render_help_invoked_then_help_body_is_present_in_output', () => {
    const helpText = 'Usage:\n  create-baseline <target>\n';
    const out = captureStdout(() => meta.renderHelp(helpText, '0.3.0'));
    assert.ok(out.includes('Usage:'), 'help body must reach stdout');
    assert.ok(out.includes('create-baseline <target>'), 'help body content must reach stdout');
  });

  it('test_when_render_help_invoked_in_tty_then_brand_banner_is_emitted', () => {
    const origTty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    try {
      const helpText = 'Usage:\n';
      const out = captureStdout(() => meta.renderHelp(helpText, '0.3.0'));
      assert.ok(/baseline/i.test(out), 'brand banner must include the product name in TTY mode');
      assert.ok(out.includes('Usage:'), 'help body must follow the brand banner');
      // The version is intentionally NOT rendered by renderHelp — see the
      // splash.js docstring on renderSplash: "The version is intentionally NOT
      // rendered here — `--version` already surfaces it via renderVersionMarquee,
      // and embedding it in the splash would force docs-site screenshots to
      // re-render every release." renderVersion covers the version-in-banner case.
    } finally {
      process.stdout.isTTY = origTty;
    }
  });

  it('test_when_render_version_invoked_then_version_string_is_present', () => {
    const out = captureStdout(() => meta.renderVersion('0.3.0'));
    assert.ok(out.includes('0.3.0'), 'version number must be present in output');
  });

  it('test_when_render_version_invoked_in_non_tty_then_emits_bare_version_for_script_compat', () => {
    const origTty = process.stdout.isTTY;
    process.stdout.isTTY = false;
    try {
      const out = captureStdout(() => meta.renderVersion('0.3.0'));
      assert.equal(out.trim(), '0.3.0', 'non-TTY version must be a bare version line so `$(cli --version)` keeps working');
    } finally {
      process.stdout.isTTY = origTty;
    }
  });
});
