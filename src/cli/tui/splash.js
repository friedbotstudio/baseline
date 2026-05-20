// Domain — branded splash surfaces for the CLI. Renders a chunky pixel-art
// "BASELINE" wordmark in three bands of FBS orange (bevel: shadow / mid /
// highlight / mid / shadow) so the marquee surfaces (--help, --version,
// no-arg landing) share a single visual identity. Slimmer brand strip is
// reused by install / upgrade intros and inside the usage-error renderer.
//
// All renderers degrade cleanly when stdout is not a TTY or NO_COLOR is set
// (paintRGB short-circuits to plain text). When the terminal is narrower
// than the wordmark, callers should fall through to the plain banner via
// `wordmarkFits(width)` instead of letting the glyphs wrap.

import { paintRGB, PALETTE, accent, muted } from './tokens.js';

// ANSI-Shadow style block-letter wordmark for "BASELINE". 5 rows × ~60 cols.
// Kept as raw strings (not paint-wrapped) so renderWordmark can apply a
// per-row shade. Trailing spaces matter — they're part of the glyph shape.
const WORDMARK = [
  '██████   █████  ███████ ███████ ██      ██ ███    ██ ███████',
  '██   ██ ██   ██ ██      ██      ██      ██ ████   ██ ██     ',
  '██████  ███████ ███████ █████   ██      ██ ██ ██  ██ █████  ',
  '██   ██ ██   ██      ██ ██      ██      ██ ██  ██ ██ ██     ',
  '██████  ██   ██ ███████ ███████ ███████ ██ ██   ████ ███████',
];

// Outline trace — mirrors the bottom row of the wordmark using the upper
// one-eighth block (▔) so it visually kisses the base of every letter,
// producing the subtle "letters are sitting on a baseline" shadow from
// the skills.sh reference. Painted in accentShadow so it reads as a
// trace, not a fifth band of the letter body.
const WORDMARK_OUTLINE = WORDMARK[4].replace(/█/g, '▔');

// Bevel banding: dim → mid → bright → mid → dim. Produces the chiseled
// pixel-art look of the skills.sh reference (substituting FBS oranges for
// the reference's grayscale palette).
const SHADES = [
  PALETTE.accentShadow,
  PALETTE.accent,
  PALETTE.accentLight,
  PALETTE.accent,
  PALETTE.accentShadow,
];

const WORDMARK_WIDTH = Math.max(...WORDMARK.map((row) => row.length));

export const SPLASH_COMMANDS = Object.freeze([
  ['$ npx @friedbotstudio/create-baseline <target>', 'Install the baseline'],
  ['$ npx @friedbotstudio/create-baseline upgrade',  'Three-way merge upgrade'],
  ['$ npx @friedbotstudio/create-baseline doctor',   'Drift report'],
]);

// `process.stdout.columns` is 0 (not undefined) under `script(1)` and some
// CI ptys; treat any falsy value as "unknown, assume wide enough" so the
// marquee renders rather than silently degrading to the plain banner.
export function wordmarkFits(columns) {
  const cols = columns ?? process.stdout.columns;
  if (!cols) return true;
  return cols >= WORDMARK_WIDTH;
}

export function renderWordmark() {
  const bands = WORDMARK.map((row, i) => paintRGB(SHADES[i], row));
  bands.push(paintRGB(PALETTE.accentShadow, WORDMARK_OUTLINE));
  return bands.join('\n');
}

// Full marquee splash. Used by --help in TTY and the no-arg landing. The
// version is intentionally NOT rendered here — `--version` already surfaces
// it via renderVersionMarquee, and embedding it in the splash would force
// docs-site screenshots to re-render every release.
export function renderSplash({ tagline, tryLine, discoverUrl } = {}) {
  const lines = [
    '',
    `${muted('▲')} ${muted('~/')} ${muted('npx @friedbotstudio/create-baseline@latest')}`,
    '',
    renderWordmark(),
    '',
    muted(tagline ?? 'The Claude Code baseline — hooks, skills, MCP, governance.'),
    '',
  ];
  for (const [cmd, desc] of SPLASH_COMMANDS) {
    const left = `  ${cmd}`;
    lines.push(`${left.padEnd(54)}${muted(desc)}`);
  }
  if (tryLine) {
    lines.push('');
    lines.push(`${muted('try:')} ${tryLine}`);
  }
  if (discoverUrl) {
    lines.push('');
    lines.push(`${muted('Discover more at')} ${discoverUrl}`);
  }
  lines.push('');
  lines.push(`${muted('▲')} ${muted('~/')}`);
  lines.push('');
  return lines.join('\n');
}

// Slim two-line brand strip. Used by install / upgrade intros, --version,
// and the top of the usage-error renderer. Cheap and width-safe (~32 cols).
export function renderBrandStrip({ version, subtitle } = {}) {
  const left = `${accent('▲ BASELINE')}`;
  const right = version ? `  ${muted(`v${version}`)}` : '';
  const sub = subtitle ? `\n  ${muted(subtitle)}` : '';
  return ['', `${left}${right}${sub}`, ''].join('\n');
}

// --version flourish: the wordmark + a version line. Wider than the strip;
// callers should fall back to renderBrandStrip when the terminal is narrow.
export function renderVersionMarquee(version) {
  return ['', renderWordmark(), '', `  ${muted(`v${version}`)}`, ''].join('\n');
}
