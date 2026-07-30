// Foundation — oklch → relative luminance → WCAG contrast ratio.
//
// Why this exists: the site's palette is authored entirely in oklch (46 uses
// before the 1b redesign, more after). Every contrast assertion therefore has to
// cross from oklch to linear sRGB before it can apply WCAG's luminance formula.
// Doing that inline in a test file would put three coordinate-space conversions
// next to the assertions that consume them — two abstraction levels at one call
// site. The conversion lives here; the suite reads as claims about ratios.
//
// Stdlib only, no dependencies: there is no CSS-color package in the tree and
// this is ~60 lines of arithmetic with a published, checkable definition.
//
// References:
//   oklab/oklch  — Björn Ottosson, https://bottosson.github.io/posts/oklab/
//   WCAG 2.2 relative luminance + contrast ratio — https://www.w3.org/TR/WCAG22/#dfn-relative-luminance

const OKLCH_RE = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i;

/** Parse an `oklch(L% C H[ / A])` string into components. Returns null when it isn't one. */
export function parseOklch(value) {
  const m = OKLCH_RE.exec(String(value ?? ''));
  if (!m) return null;
  const rawAlpha = m[4];
  const alpha = rawAlpha === undefined
    ? 1
    : rawAlpha.endsWith('%') ? Number.parseFloat(rawAlpha) / 100 : Number.parseFloat(rawAlpha);
  return {
    l: Number.parseFloat(m[1]) / 100,
    c: Number.parseFloat(m[2]),
    h: Number.parseFloat(m[3]),
    alpha,
  };
}

/** oklch → linear-light sRGB triple, clamped into gamut. */
export function oklchToLinearSrgb({ l, c, h }) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lCbrt = l + 0.3963377774 * a + 0.2158037573 * b;
  const mCbrt = l - 0.1055613458 * a - 0.0638541728 * b;
  const sCbrt = l - 0.0894841775 * a - 1.291485548 * b;

  const lLms = lCbrt ** 3;
  const mLms = mCbrt ** 3;
  const sLms = sCbrt ** 3;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  return {
    r: clamp(4.0767416621 * lLms - 3.3077115913 * mLms + 0.2309699292 * sLms),
    g: clamp(-1.2684380046 * lLms + 2.6097574011 * mLms - 0.3413193965 * sLms),
    b: clamp(-0.0041960863 * lLms - 0.7034186147 * mLms + 1.707614701 * sLms),
  };
}

/**
 * WCAG relative luminance. Input is already linear-light, which is exactly what
 * the WCAG formula consumes after its own sRGB linearisation step — so no
 * gamma decode happens here, and adding one would double-apply it.
 */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Composite a possibly-translucent foreground over an opaque backdrop, in linear light. */
function composite(fg, bg, alpha) {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

/**
 * Contrast ratio between two oklch colours, 1..21.
 *
 * A translucent foreground is composited over the background first — reporting
 * the ratio of an un-composited translucent colour would overstate contrast for
 * exactly the tokens most likely to fail (hairlines, muted-on-dark text).
 */
export function contrastRatio(foreground, background) {
  const fg = parseOklch(foreground);
  const bg = parseOklch(background);
  if (!fg || !bg) {
    throw new TypeError(`contrastRatio expects two oklch() colours, got "${foreground}" / "${background}"`);
  }

  const bgLinear = oklchToLinearSrgb(bg);
  let fgLinear = oklchToLinearSrgb(fg);
  if (fg.alpha < 1) fgLinear = composite(fgLinear, bgLinear, fg.alpha);

  const lightest = Math.max(relativeLuminance(fgLinear), relativeLuminance(bgLinear));
  const darkest = Math.min(relativeLuminance(fgLinear), relativeLuminance(bgLinear));
  return (lightest + 0.05) / (darkest + 0.05);
}

/** WCAG AA floor: 3.0 for large text (>= 24px, or >= 18.66px bold), 4.5 otherwise. */
export function aaFloorFor({ fontSizePx, bold = false }) {
  const isLarge = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
  return isLarge ? 3.0 : 4.5;
}
