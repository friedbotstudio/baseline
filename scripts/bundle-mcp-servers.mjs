// Build-time bundler for the first-party MCP servers.
//
// Each server entry (`server.mjs`) imports `@modelcontextprotocol/sdk` + `zod`,
// which are devDependencies and never reach a consumer install. esbuild inlines
// them into a single self-contained file so the shipped server runs with only
// production dependencies present (the baseline stays zero-runtime-dep). The
// bundle overwrites the copied `server.mjs` in place inside the template tree;
// the dev-tree source is left readable/unbundled.
//
// Spec: docs/specs/bundle-mcp-servers-esbuild.md. Invoked by build-template.sh
// Stage 1.7, after the prune stage and before the manifest is stamped.
//
// esbuild is imported lazily (inside bundleServers) so a build in a dependency-
// free clone — the structural-test fixtures rsync the tree excluding
// node_modules — degrades to shipping the raw sources instead of crashing. Every
// real publish (npm ci / local devDeps → prepack) has esbuild, so shipped
// artifacts are always bundled; the tarball smoke test guards that boundary.
import { access } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const TARGETS = [
  { server: 'sprint-channel', entry: '.claude/mcp/sprint-channel/server.mjs' },
  { server: 'sprint-pool', entry: '.claude/mcp/sprint-pool/server.mjs' },
];

// A specifier is bundled-away unless it is a Node builtin. `node:` covers the
// prefixed form; server sources use only prefixed builtins, so anything else
// remaining after a bundle is an un-inlined dependency.
export function isSelfContained(sourceText) {
  const specs = [];
  const staticImport = /(?:^|\n)\s*(?:import\b[^'"]*?from\s*|import\s*)['"]([^'"]+)['"]/g;
  const dynamicImport = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticImport, dynamicImport]) {
    let m;
    while ((m = re.exec(sourceText)) !== null) specs.push(m[1]);
  }
  const offenders = specs.filter((s) => !s.startsWith('node:'));
  return { ok: offenders.length === 0, offenders };
}

function shippedTargets(templateDir) {
  // A template ships a server iff its directory is present (a fixture build or a
  // consumer without these servers has neither) — bundle only what is present.
  return TARGETS.filter((t) => existsSync(dirname(join(templateDir, t.entry))));
}

async function bundleTarget(build, templateDir, target) {
  const entry = join(templateDir, target.entry);
  // The server directory is present (shippedTargets filter); a missing entry file
  // is corruption and surfaces as access()'s throw — no partial output.
  await access(entry);
  await build({
    entryPoints: [entry],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    allowOverwrite: true,
    absWorkingDir: REPO_ROOT,
    // Resolve the inlined deps (SDK, zod) from the repo's node_modules even when
    // the entry lives in a template tree outside the repo (esbuild otherwise
    // walks up from the entry file, which a temp/obj dir has no node_modules on).
    nodePaths: [join(REPO_ROOT, 'node_modules')],
  });
  process.stderr.write(`build: bundled ${target.server} (${statSync(entry).size} bytes)\n`);
}

export async function bundleServers(templateDir) {
  const targets = shippedTargets(templateDir);
  if (targets.length === 0) return;
  let build;
  try {
    ({ build } = await import('esbuild'));
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      process.stderr.write('build: esbuild not installed — MCP servers shipped unbundled (run `npm install` for self-contained artifacts)\n');
      return;
    }
    throw err;
  }
  for (const target of targets) {
    await bundleTarget(build, templateDir, target);
  }
}

async function main() {
  const templateDir = process.argv[2];
  if (!templateDir) {
    process.stderr.write('usage: bundle-mcp-servers.mjs <template-dir>\n');
    process.exit(1);
  }
  await bundleServers(templateDir);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    process.stderr.write(`build: bundle failed: ${err.message}\n`);
    process.exit(1);
  });
}
