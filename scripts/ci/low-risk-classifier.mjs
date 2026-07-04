#!/usr/bin/env node
// Low-risk PR classifier for the auto-merge workflow (baseline CI posture).
//
// Verdict model (AC-010): a diff is low-risk ONLY when every changed path is
// a prose surface (allowlist) AND no path hits the NEVER-list. The NEVER-list
// takes precedence and always classifies not-low-risk: enforcement hooks, the
// CI control plane, dependency manifests, licence/SBOM files, and governance
// docs are never auto-merged. An empty diff is not-low-risk (fail-safe).
//
// CLI: node low-risk-classifier.mjs <path> [<path> ...]
//      node low-risk-classifier.mjs --stdin   (newline-separated paths)
// Output: JSON {low_risk, reasons} on stdout. Exit 0 low-risk, 1 otherwise.
import { pathToFileURL } from 'node:url';

const NEVER_RULES = [
  { name: 'enforcement hooks (.githooks/**)', matches: (p) => p.startsWith('.githooks/') },
  { name: 'Claude Code hooks (.claude/hooks/**)', matches: (p) => p.startsWith('.claude/hooks/') },
  { name: 'CI control plane (.github/**)', matches: (p) => p.startsWith('.github/') },
  { name: 'CI scripts (scripts/ci/**)', matches: (p) => p.startsWith('scripts/ci/') },
  {
    name: 'dependency manifest',
    matches: (p) => ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'].includes(p),
  },
  {
    name: 'licence/SBOM file',
    matches: (p) => /(^|\/)(LICENSE|NOTICE|COPYING)([.-].*)?$/.test(p) || p.endsWith('.spdx.json'),
  },
  {
    name: 'governance doc',
    matches: (p) => p === 'CLAUDE.md' || p === '.claude/CONSTITUTION.md' || p.startsWith('docs/init/'),
  },
];

const PROSE_ALLOWLIST = [
  { name: 'docs prose (docs/**)', matches: (p) => p.startsWith('docs/') },
  { name: 'site source (site-src/**)', matches: (p) => p.startsWith('site-src/') },
  { name: 'README', matches: (p) => p === 'README.md' },
];

export function classify(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { low_risk: false, reasons: ['empty diff — fail-safe not-low-risk'] };
  }
  const reasons = [];
  for (const path of paths) {
    const never = NEVER_RULES.find((rule) => rule.matches(path));
    if (never) reasons.push(`${path}: NEVER-list — ${never.name}`);
  }
  if (reasons.length > 0) return { low_risk: false, reasons };

  for (const path of paths) {
    const allowed = PROSE_ALLOWLIST.some((rule) => rule.matches(path));
    if (!allowed) reasons.push(`${path}: not a prose surface — only docs/site prose auto-merges`);
  }
  if (reasons.length > 0) return { low_risk: false, reasons };

  return { low_risk: true, reasons: [] };
}

async function readPathsFromStdin() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.includes('--stdin')
    ? await readPathsFromStdin()
    : args.filter((a) => a !== '--stdin');
  const verdict = classify(paths);
  process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  process.exit(verdict.low_risk ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
