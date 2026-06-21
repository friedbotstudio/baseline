// Foundation: the post-tdd right-size gate (velocity Lever 2). Measures the real
// working-tree diff and decides which downstream phases a *micro* diff may skip.
// Mechanical by construction — the skip set is a pure function of file/line counts
// and glob set-intersection, never LLM judgment. Bounded: the skip allowlist is a
// hard subset of {simplify, document}; `security` is NEVER auto-skipped (a human
// decision, default runs). Fail-open: any error / disabled config yields an empty
// skip and empty advisories, so a malfunction degrades to today's full pipeline.
//
// The consuming side (harness loop applying skip[] to workflow.json exceptions +
// auto_skipped[], surfacing advisories[]) is documented in harness/SKILL.md and
// goes live the next spec-track workflow; this module is the mechanical oracle.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATE_PHASES = ['simplify', 'security', 'document'];
const DEFAULT_DOC_GLOBS = ['docs/**', '**/*.md', 'src/cli/**', 'bin/**'];

// Glob helpers — stdlib-only, copied (not imported) to keep this self-contained,
// mirroring the convention in .claude/hooks/lib/write-set-profile.mjs.
function expandBraces(globs) {
  const out = [];
  for (const g of globs) {
    if (!g.includes('{')) { out.push(g); continue; }
    const i = g.indexOf('{'), j = g.indexOf('}', i);
    if (j < 0) { out.push(g); continue; }
    const prefix = g.slice(0, i);
    const alts = g.slice(i + 1, j).split(',');
    const suffix = g.slice(j + 1);
    for (const a of alts) out.push(prefix + a.trim() + suffix);
  }
  return out;
}

function globToRegex(g) {
  let out = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**/` matches zero or more leading path segments (so `**/*.md` matches a
        // top-level `README.md`); a bare `**` matches anything.
        if (g[i + 2] === '/') { out += '(?:.*/)?'; i += 2; }
        else { out += '.*'; i++; }
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if ('.+()|^$\\[]{}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return new RegExp('^' + out + '$');
}

export function matchesAnyGlob(p, globs) {
  for (const g of expandBraces(globs || [])) {
    if (globToRegex(g).test(p)) return true;
  }
  return false;
}

export function parseNumstat(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [a, d, ...rest] = parts;
    const added = a === '-' ? 0 : parseInt(a, 10) || 0;
    const deleted = d === '-' ? 0 : parseInt(d, 10) || 0;
    rows.push({ added, deleted, path: rest.join('\t').trim() });
  }
  return rows;
}

export function measureDiff(rows) {
  return {
    files: rows.length,
    lines: rows.reduce((sum, r) => sum + r.added + r.deleted, 0),
    touched: rows.map((r) => r.path),
  };
}

function pathsMatching(touched, globs) {
  return touched.filter((p) => matchesAnyGlob(p, globs));
}

export function decideSkip({ measure, config, securityRunning }) {
  if (!config.enabled) {
    return { skip: [], keep: [...CANDIDATE_PHASES], advisories: [] };
  }

  const micro = measure.files < config.min_files && measure.lines <= config.max_lines;
  const skip = [];
  if (micro) {
    skip.push('simplify');
    if (pathsMatching(measure.touched, config.doc_globs).length === 0) skip.push('document');
  }

  const advisories = [];
  if (!securityRunning) {
    const sensitive = pathsMatching(measure.touched, config.sensitive_globs);
    if (sensitive.length > 0) {
      advisories.push({
        kind: 'sensitive_surface_unreviewed',
        paths: sensitive,
        message: 'security skipped but sensitive paths changed; run /security',
      });
    }
  }

  const keep = CANDIDATE_PHASES.filter((p) => !skip.includes(p));
  return { skip, keep, advisories };
}

function configFromProject(project) {
  return {
    enabled: project?.velocity?.rightsize?.enabled ?? true,
    min_files: project?.simplify?.min_files ?? 4,
    max_lines: project?.velocity?.rightsize?.max_lines ?? 80,
    doc_globs: project?.velocity?.rightsize?.doc_globs ?? DEFAULT_DOC_GLOBS,
    sensitive_globs: project?.security?.sensitive_globs ?? [],
  };
}

function collectMeasure(rootDir, exec) {
  const tracked = exec('git', ['-C', rootDir, 'diff', 'HEAD', '--numstat']);
  let combined = tracked;
  const listed = exec('git', ['-C', rootDir, 'ls-files', '--others', '--exclude-standard']);
  for (const rel of listed.split('\n').map((s) => s.trim()).filter(Boolean)) {
    // --no-index numstat counts an untracked file's lines as added without staging.
    // It exits non-zero when files differ; the numstat is on stdout regardless, so
    // the injected exec must tolerate that (execFileSync throws — caught below).
    let d = '';
    try {
      d = exec('git', ['-C', rootDir, 'diff', '--no-index', '--numstat', '--', '/dev/null', rel]);
    } catch (e) {
      d = e.stdout ? String(e.stdout) : '';
    }
    if (d) combined += (combined.endsWith('\n') || !combined ? '' : '\n') + d;
  }
  return measureDiff(parseNumstat(combined));
}

export async function main(argv, deps = {}) {
  const failOpen = () => {
    process.stdout.write(JSON.stringify({ skip: [], keep: [...CANDIDATE_PHASES], advisories: [] }) + '\n');
    return 0;
  };
  try {
    const [sub] = argv;
    if (sub !== 'check') return failOpen();
    const rootDir = deps.rootDir || process.cwd();
    const exec = deps.exec || ((cmd, args) =>
      execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const config = configFromProject(deps.project);
    const securityRunning = !((deps.workflow?.exceptions) || []).includes('security');

    const measure = collectMeasure(rootDir, exec);
    const decision = decideSkip({ measure, config, securityRunning });
    process.stdout.write(JSON.stringify({ ...decision, measured: measure }) + '\n');
    return 0;
  } catch {
    return failOpen();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
