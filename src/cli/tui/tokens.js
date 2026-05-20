// Foundation — ANSI brand-color helpers for the TUI presentation layer.
// Translates Friedbot Studio's oklch tokens (site-src/assets/site.css :root) to
// 24-bit truecolor escape sequences. Respects NO_COLOR (https://no-color.org)
// and skips emission when stdout is not a TTY.

const NO_COLOR = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';

// oklch -> approximate sRGB hex used in the rendered docs site:
//   --accent-shadow oklch(35% 0.15 41.5)   ~ #7a2907   (dark band of the wordmark bevel)
//   --accent       oklch(55.8% 0.187 41.5) ~ #c2410c   (orange-700)
//   --accent-light oklch(70.3% 0.187 41.5) ~ #ea6a25   (orange-500)
//   --muted        oklch(45% 0.026 257)    ~ #6b7280
//   --cli-success  oklch(70% 0.15 145)     ~ #4ade80
//   --warn         oklch(58% 0.13 60)      ~ #d97706
//   --mac-red      oklch(70% 0.21 24)      ~ #ef4444
//   --rule         oklch(89% 0.013 257)    ~ #d1d5db
const RGB = {
  accentShadow: [122, 41, 7],
  accent: [194, 65, 12],
  accentLight: [234, 106, 37],
  muted: [107, 114, 128],
  success: [74, 222, 128],
  warn: [217, 119, 6],
  error: [239, 68, 68],
  rule: [209, 213, 219],
};

// Exposed for the splash wordmark, which paints individual rows in their own
// shade. All other UI tokens funnel through the named helpers below.
export function paintRGB(rgb, text) {
  if (NO_COLOR || !process.stdout.isTTY) return text;
  const [r, g, b] = rgb;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

export const PALETTE = Object.freeze(RGB);

export const accentShadow = (text) => paintRGB(RGB.accentShadow, text);
export const accent = (text) => paintRGB(RGB.accent, text);
export const accentLight = (text) => paintRGB(RGB.accentLight, text);
export const muted = (text) => paintRGB(RGB.muted, text);
export const success = (text) => paintRGB(RGB.success, text);
export const warn = (text) => paintRGB(RGB.warn, text);
export const error = (text) => paintRGB(RGB.error, text);
export const rule = (text) => paintRGB(RGB.rule, text);
