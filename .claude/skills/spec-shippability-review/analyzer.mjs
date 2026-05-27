// Domain — shippability checks shared between check.mjs (per-spec drafts) and
// scan-shipped-skills.mjs (aggregate shipped-SKILL.md scan).
//
// C1 (DEV_TREE_RUNTIME_REF) and C3 (UNSHIPPED_MODULE_IMPORT) both inspect
// shell fences for runtime invocations that would fail in a consumer install.
// They share the same fence-extraction + pattern-matching machinery; the
// difference is what they compare each match against:
//
//   C1 — the matched path's leading prefix (src/, tests/, scripts/, obj/, docs/
//        except docs/init/seed.md). Dev-only prefixes are BLOCKER.
//   C3 — for .claude/-prefixed matches: whether the path appears in the
//        shipped manifest's `files` map. Absent paths are BLOCKER.
//
// C2 (DEV_HELPER_EXTENSION) is spec-specific (scans write_set rather than
// fences) and lives in check.mjs.
//
// Spec: docs/specs/marker-helper-shipped-instead-of-dev-import.md

const DEV_ONLY_PREFIXES = ['src/', 'tests/', 'scripts/', 'obj/'];

const RUNTIME_INVOCATION_PATTERNS = [
  { re: /(?:import|require)\s*\(\s*['"`](?:\.\/)?([.\w][\w./-]*)['"`]\s*\)/g, group: 1 },
  { re: /(?:^|\n)\s*import\s+(?:[\s\S]*?\sfrom\s+)?['"`]([^'"`\n]+)['"`]/g, group: 1 },
  { re: /\b(?:node|python3?|bash|sh)\s+(?:\.\/)?([.\w][\w./-]*\.\w+)\b/g, group: 1 },
  { re: /(?<![\w/])(\.\/(?:src|tests|scripts|obj|docs)\/[\w./-]+)(?:\s|$)/g, group: 1 },
];

export function isDevOnlyPath(path) {
  const normalized = path.replace(/^(?:\.\.\/)+/, '');
  if (DEV_ONLY_PREFIXES.some((p) => normalized.startsWith(p))) return true;
  if (normalized.startsWith('docs/') && normalized !== 'docs/init/seed.md') return true;
  return false;
}

export function collectShellFences(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)```(bash|sh|shell)\s*$/);
    if (!m) continue;
    const indent = m[1];
    const closeRe = new RegExp(`^${indent}\\\`\\\`\\\`\\s*$`);
    const body = [];
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) {
      body.push(lines[j]);
      j++;
    }
    out.push({ startLine: i + 2, body: body.join('\n') });
    i = j;
  }
  return out;
}

const INLINE_BACKTICK_RE = /(?<!`)`([^`\n]+)`(?!`)/g;

// Companion to `collectShellFences`. Single-backtick inline code spans inside
// *.md prose carry the same dev-tree-reference risk as fenced blocks (e.g., the
// harness SKILL.md line 59 leak that ran inline, not fenced). Negative
// look-around prevents matching the inner ticks of a triple-fence.
export function collectInlineBackticks(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    INLINE_BACKTICK_RE.lastIndex = 0;
    let m;
    while ((m = INLINE_BACKTICK_RE.exec(lines[i])) !== null) {
      out.push({ startLine: i + 1, body: m[1] });
    }
  }
  return out;
}

// Wraps a helper file's body as a single fence-shaped chunk so the existing
// `runDevTreeAndUnshippedChecks` pipeline applies uniformly. JS comments are
// stripped first — historical-reference comments (e.g., upgrade-project/
// marker.mjs explaining the v0.8.1 bug it replaced) would otherwise trip the
// runtime-invocation regex even though they are inert prose.
export function collectHelperFileContent(text) {
  if (text === '') return [];
  return [{ startLine: 1, body: stripJsComments(text) }];
}

function stripJsComments(text) {
  const lines = text.split('\n');
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push(''); continue; }
      out.push(' '.repeat(end + 2) + maskInlineComments(line.slice(end + 2)));
      inBlock = false;
      continue;
    }
    const blockStart = line.indexOf('/*');
    if (blockStart !== -1) {
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd === -1) {
        out.push(maskInlineComments(line.slice(0, blockStart)) + ' '.repeat(line.length - blockStart));
        inBlock = true;
      } else {
        out.push(
          maskInlineComments(line.slice(0, blockStart))
            + ' '.repeat(blockEnd - blockStart + 2)
            + maskInlineComments(line.slice(blockEnd + 2)),
        );
      }
      continue;
    }
    out.push(maskInlineComments(line));
  }
  return out.join('\n');
}

function maskInlineComments(line) {
  let inSingle = false, inDouble = false, inTemplate = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = line[i - 1];
    if (!inDouble && !inTemplate && ch === "'" && prev !== '\\') inSingle = !inSingle;
    else if (!inSingle && !inTemplate && ch === '"' && prev !== '\\') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`' && prev !== '\\') inTemplate = !inTemplate;
    else if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
    else if (!inSingle && !inDouble && !inTemplate && ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

export function collectMarkdownCode(text) {
  return [...collectShellFences(text), ...collectInlineBackticks(text)];
}

export function runDevTreeAndUnshippedChecks(fences, manifest, sourcePath) {
  const shippedFiles = new Set(Object.keys(manifest?.files ?? {}));
  const findings = [];
  const seenC1 = new Set();
  const seenC3 = new Set();
  for (const fence of fences) {
    for (const { re, group } of RUNTIME_INVOCATION_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(fence.body)) !== null) {
        const refPath = stripLeadingDotSlash(m[group]);
        const line = fence.startLine + countNewlines(fence.body.slice(0, m.index));
        appendDevTreeRefFinding({ refPath, line, evidence: m[0], sourcePath, findings, seen: seenC1 });
        appendUnshippedImportFinding({ refPath, line, evidence: m[0], sourcePath, findings, seen: seenC3, shippedFiles });
      }
    }
  }
  return findings;
}

function appendDevTreeRefFinding({ refPath, line, evidence, sourcePath, findings, seen }) {
  if (!isDevOnlyPath(refPath)) return;
  const key = `${line}:${refPath}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({
    severity: 'BLOCKER',
    check: 'DEV_TREE_RUNTIME_REF',
    file: sourcePath,
    line,
    evidence: trimEvidence(evidence),
    message: `Runtime invocation references \`${refPath}\` — \`${devPrefix(refPath)}\` is dev-only; consumer installs do not receive this directory.`,
    suggested_fix: `Move the logic into a shipped helper under \`.claude/skills/<slug>/<helper>.mjs\`, OR inline the implementation into the \`node -e "..."\` command body.`,
  });
}

function appendUnshippedImportFinding({ refPath, line, evidence, sourcePath, findings, seen, shippedFiles }) {
  if (!refPath.startsWith('.claude/')) return;
  if (shippedFiles.has(refPath)) return;
  if (seen.has(refPath)) return;
  seen.add(refPath);
  findings.push({
    severity: 'BLOCKER',
    check: 'UNSHIPPED_MODULE_IMPORT',
    file: sourcePath,
    line,
    evidence: trimEvidence(evidence),
    message: `Runtime invocation references \`${refPath}\`, which is NOT in \`obj/template/.claude/manifest.json\`. Consumer installs won't have this file.`,
    suggested_fix: `Add the file to a baseline-owned skill directory (so \`scripts/build-template.sh\` picks it up via the recursive cp and \`scripts/build-manifest.mjs\` adds it to the manifest), OR change the invocation to reference a file that IS in the shipped manifest.`,
  });
}

function stripLeadingDotSlash(p) {
  return p.startsWith('./') ? p.slice(2) : p;
}

function devPrefix(path) {
  const normalized = path.replace(/^(?:\.\.\/)+/, '');
  for (const p of DEV_ONLY_PREFIXES) if (normalized.startsWith(p)) return p.slice(0, -1);
  if (normalized.startsWith('docs/')) return 'docs';
  return normalized.split('/')[0];
}

function countNewlines(s) { return (s.match(/\n/g) || []).length; }

function trimEvidence(s) {
  const collapsed = s.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? collapsed.slice(0, 117) + '...' : collapsed;
}
