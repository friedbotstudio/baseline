// Tests for the branded splash module — wordmark structure, shading bands,
// command table, brand-strip composition, and graceful non-TTY degradation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderWordmark,
  renderSplash,
  renderBrandStrip,
  renderVersionMarquee,
  wordmarkFits,
  SPLASH_COMMANDS,
  renderHeader,
} from '../src/cli/tui/splash.js';

// Strip ANSI escape sequences so structural assertions stay independent of
// the paintRGB color-application toggle (which depends on stdout.isTTY).
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('splash — wordmark', () => {
  it('renders the BASELINE wordmark with five letter rows plus an outline trace', () => {
    const out = stripAnsi(renderWordmark());
    const rows = out.split('\n');
    assert.equal(rows.length, 6, `expected 6 rows (5 letter bands + 1 outline trace); got ${rows.length}`);
    assert.ok(/▔/.test(rows[5]), 'last row must be the outline trace built from ▔ characters');
  });

  it('letter rows contain block characters, outline contains trace characters, all rows have identical width', () => {
    const out = stripAnsi(renderWordmark());
    const rows = out.split('\n');
    const letterRows = rows.slice(0, 5);
    const outlineRow = rows[5];
    assert.ok(letterRows.every((r) => /█/.test(r)), 'every letter row must contain at least one █');
    assert.ok(/▔/.test(outlineRow), 'outline row must contain ▔');
    assert.ok(!/█/.test(outlineRow), 'outline row must contain only trace characters, not block characters');
    const widths = rows.map((r) => r.length);
    assert.equal(new Set(widths).size, 1, `row widths must be uniform; got ${widths.join(',')}`);
  });

  it('wordmarkFits returns true at 80 cols and false at 40 cols', () => {
    assert.equal(wordmarkFits(80), true);
    assert.equal(wordmarkFits(40), false);
  });

  it('wordmarkFits treats falsy columns (script(1) pty, undetected terminal) as wide-enough', () => {
    assert.equal(wordmarkFits(0), true, '0 columns must be treated as unknown, not as too-narrow');
  });
});

describe('splash — full splash composition', () => {
  it('includes the prompt chevron, tagline, command table, try line, and discover URL', () => {
    const out = stripAnsi(renderSplash({
      tagline: 'The Claude Code baseline.',
      tryLine: 'npx @friedbotstudio/create-baseline ./my-project',
      discoverUrl: 'https://baseline.friedbotstudio.com/',
    }));
    assert.ok(/▲/.test(out), 'splash must include the prompt chevron');
    assert.ok(/The Claude Code baseline\./.test(out), 'tagline must be present');
    assert.ok(/\$ npx @friedbotstudio\/create-baseline <target>/.test(out), 'install command line must be present');
    assert.ok(/Install the baseline/.test(out), 'install description must be present');
    assert.ok(/try: npx @friedbotstudio\/create-baseline \.\/my-project/.test(out), 'try line must be present');
    assert.ok(/Discover more at https:\/\/baseline\.friedbotstudio\.com\//.test(out), 'discover URL must be present');
  });

  it('does NOT print a version line — version belongs to --version, not the splash', () => {
    // Keeping version out of the splash means the embedded docs-site
    // screenshot doesn't go stale every release. Regression guard.
    const out = stripAnsi(renderSplash({
      tagline: 'tag',
      tryLine: 't',
      discoverUrl: 'https://x/',
    }));
    assert.ok(!/^v\d+\.\d+\.\d+/m.test(out), 'splash must not render a version line');
  });

  it('renders all SPLASH_COMMANDS entries', () => {
    const out = stripAnsi(renderSplash({}));
    for (const [cmd, desc] of SPLASH_COMMANDS) {
      assert.ok(out.includes(cmd), `splash must include command '${cmd}'`);
      assert.ok(out.includes(desc), `splash must include description '${desc}'`);
    }
  });

  it('omits the try and discover lines when not provided', () => {
    const out = stripAnsi(renderSplash({}));
    assert.ok(!/^try:/m.test(out), 'try line must not appear without input');
    assert.ok(!/Discover more/.test(out), 'discover line must not appear without input');
  });
});

// Per docs/specs/upgrade-no-replay-prompts.md sibling workflow (cli-wordmark-on-all-commands):
// renderHeader is the new wordmark+tagline composition used by install / upgrade / doctor
// TUI entries. It returns the same upper portion of renderSplash (prompt-line + wordmark +
// tagline + optional subtitle) without the SPLASH_COMMANDS list, and falls back to
// renderBrandStrip when the terminal is narrower than the wordmark.
describe('splash — renderHeader (wordmark header for install/upgrade/doctor)', () => {
  it('test_when_renderHeader_called_then_emits_wordmark_and_tagline', () => {
    const out = stripAnsi(renderHeader({ subtitle: 'install' }));
    assert.ok(/██████/.test(out), 'header must include the BASELINE block-letter wordmark');
    assert.ok(/baseline/i.test(out), 'header must include the default tagline mentioning the baseline');
    assert.ok(/install/.test(out), 'subtitle must appear when provided');
  });

  it('test_when_renderHeader_called_without_options_then_emits_wordmark_and_default_tagline', () => {
    const out = stripAnsi(renderHeader());
    assert.ok(/██████/.test(out), 'wordmark must render with no args');
    assert.ok(/baseline/i.test(out), 'default tagline must appear');
    assert.ok(!/install|upgrade|doctor/.test(out), 'no subtitle should appear without input');
  });

  it('test_when_renderHeader_called_with_narrow_columns_then_falls_back_to_brand_strip', () => {
    const narrow = stripAnsi(renderHeader({ subtitle: 'install', columns: 40 }));
    assert.ok(!/██████/.test(narrow), 'narrow terminal must NOT render the wide wordmark');
    assert.ok(/▲ BASELINE/.test(narrow), 'narrow terminal must fall back to the slim brand strip');
  });
});

describe('splash — brand strip and version marquee', () => {
  it('brand strip includes BASELINE label and version', () => {
    const out = stripAnsi(renderBrandStrip({ version: '1.2.3' }));
    assert.ok(/▲ BASELINE/.test(out));
    assert.ok(/v1\.2\.3/.test(out));
  });

  it('brand strip can include an optional subtitle', () => {
    const out = stripAnsi(renderBrandStrip({ version: '1.2.3', subtitle: 'upgrade' }));
    assert.ok(/upgrade/.test(out));
  });

  it('version marquee contains the wordmark and a version line', () => {
    const out = stripAnsi(renderVersionMarquee('4.5.6'));
    assert.ok(/█/.test(out), 'marquee must include block characters from the wordmark');
    assert.ok(/v4\.5\.6/.test(out));
  });
});
