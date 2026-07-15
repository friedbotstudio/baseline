// A1 — blast-radius signal extraction for the Governance Class classifier.
//
// Pure: reads only its inputs (a write_set / diff path list + the project
// config), writes nothing. /triage Step 0 calls extractSignals and passes the
// result to tier-dial.classFloor. Kept next to the tier dial's read path
// (tier-dial:read-path) so there is one threat/value classification surface.
//
// The glob helpers mirror hooks/lib/write-set-profile.mjs but are copied here so
// a skill helper never imports a hook.

// Consent-adjacent path markers → force a Class-A floor. These name the consent
// artifacts + guards; touching any of them is the highest blast radius.
const CONSENT_PATTERNS = [
  /_consent\b/,
  /\.approval$/,
  /spec_approval_guard/,
  /swarm_approval_guard/,
  /epic_approval_guard/,
  /consent_gate_grant/,
  /\.spec_approval_grant/,
  /\.swarm_approval_grant/,
  /grant-commit/,
  /grant-push/,
  /git_commit_guard/,
];

// Governance surfaces (hooks + the constitution + its mirror + genesis).
function isHookOrGovernance(p) {
  return /^\.claude\/hooks\//.test(p)
    || p === 'CLAUDE.md'
    || p === 'src/CLAUDE.template.md'
    || p === 'docs/init/seed.md'
    || p === 'src/seed.template.md';
}

const LAYERS = [
  { name: 'hooks', re: /^\.claude\/hooks\// },
  { name: 'skills', re: /^\.claude\/skills\// },
  { name: 'tests', re: /^tests\// },
  { name: 'docs', re: /^docs\// },
  { name: 'source', re: /^(src|bin|scripts)\// },
];

function expandBraces(globs) {
  const out = [];
  for (const g of globs) {
    if (!g.includes('{')) { out.push(g); continue; }
    const i = g.indexOf('{'); const j = g.indexOf('}', i);
    if (j < 0) { out.push(g); continue; }
    const prefix = g.slice(0, i); const alts = g.slice(i + 1, j).split(','); const suffix = g.slice(j + 1);
    for (const a of alts) out.push(prefix + a.trim() + suffix);
  }
  return out;
}

function globToRegex(g) {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { out += '.*'; i++; } else out += '[^/]*'; }
    else if (c === '?') out += '[^/]';
    else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp('^' + out + '$');
}

function matchesAny(path, globs) {
  for (const g of expandBraces(globs)) {
    if (globToRegex(g).test(path)) return true;
  }
  return false;
}

// extractSignals({ writeSet, diffPaths, project }) → the Signals object the tier
// dial's classFloor consumes. Empty input → every signal false / zero.
export function extractSignals({ writeSet = [], diffPaths = [], project = {} } = {}) {
  const paths = [...new Set([...(Array.isArray(writeSet) ? writeSet : []), ...(Array.isArray(diffPaths) ? diffPaths : [])])]
    .filter((p) => typeof p === 'string' && p.length > 0);

  const sensitiveGlobs = Array.isArray(project && project.security && project.security.sensitive_globs)
    ? project.security.sensitive_globs
    : [];

  const consentAdjacent = paths.some((p) => CONSENT_PATTERNS.some((re) => re.test(p)));
  const sensitiveSurface = sensitiveGlobs.length > 0 && paths.some((p) => matchesAny(p, sensitiveGlobs));
  const hookOrGovernance = paths.some(isHookOrGovernance);

  const layers = new Set();
  for (const p of paths) for (const l of LAYERS) if (l.re.test(p)) layers.add(l.name);

  return {
    consentAdjacent,
    sensitiveSurface,
    hookOrGovernance,
    fileCount: paths.length,
    layerSpan: layers.size,
  };
}
