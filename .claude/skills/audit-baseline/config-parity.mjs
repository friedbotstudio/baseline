// Config parity primitives — compare the live .claude/project.json against the
// shipped src/project.template.json so an enforcement oracle enabled for baseline
// dev cannot silently ship dark (or a fixed default silently rot) in the template.
// Foundation layer: pure functions over JSON-safe config objects, no I/O. The
// audit script composes these; the parity test exercises them directly.

// Blocks the shipped consumer template may intentionally differ from live on.
// Everything else under `velocity`/`swarm` must match. These three are the
// dogfood/consumer deviations: the baseline runs the opt-in tracks and the
// presence-aware notifier; consumers get them off.
export const CONFIG_PARITY_ALLOWLIST = [
  ['velocity', 'sprint_mode', 'enabled'],
  ['velocity', 'power_mode', 'enabled'],
  ['velocity', 'notifier', 'presence'],
];

// Deep-clone a JSON-safe value, then remove one allowlisted dot-path in place.
function withoutPath(obj, segments) {
  const clone = obj == null ? obj : JSON.parse(JSON.stringify(obj));
  let cur = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return clone;
    cur = cur[segments[i]];
  }
  if (cur && typeof cur === 'object') delete cur[segments[segments.length - 1]];
  return clone;
}

// First order-independent difference between two JSON-safe values, as a dot-path
// rooted at `prefix`. Returns null when they are deeply equal. Object keys are
// compared as a set so key ordering never registers as drift.
function firstDiff(a, b, prefix) {
  if (a === b) return null;
  const aObj = a && typeof a === 'object';
  const bObj = b && typeof b === 'object';
  if (!aObj || !bObj) return a === b ? null : prefix;
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b) ? null : prefix;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[key], b[key], prefix ? `${prefix}.${key}` : key);
    if (d) return d;
  }
  return null;
}

// Compare the named blocks of the live config and the shipped template, ignoring
// the allowlisted dot-paths. Returns {ok, drift} where drift is the first
// differing dot-path or null.
export function checkConfigParity(live, template, opts = {}) {
  const allowlist = opts.allowlist || CONFIG_PARITY_ALLOWLIST;
  const blocks = opts.blocks || ['velocity', 'swarm'];
  const liveClean = allowlist.reduce((acc, p) => withoutPath(acc, p), live);
  const templateClean = allowlist.reduce((acc, p) => withoutPath(acc, p), template);
  for (const block of blocks) {
    const drift = firstDiff(liveClean?.[block], templateClean?.[block], block);
    if (drift) return { ok: false, drift };
  }
  return { ok: true, drift: null };
}
