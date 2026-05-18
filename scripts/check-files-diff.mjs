#!/usr/bin/env node
// check-files-diff.mjs — pre-publish hygiene for package.json + the packed
// tarball's file set.
//
// Sub-checks (each emits its own violation code on stderr):
//   1. files-symmetric — symmetric diff of package.json `files:` declared
//        prefixes against the entries `npm pack --dry-run --json` would emit.
//        Codes: DECLARED-NOT-PACKED, PACKED-NOT-DECLARED.
//   2. package-integrity — dependencies must be empty; optionalDependencies
//        must be absent; scripts.{preinstall,install,postinstall} must be
//        absent; scripts.prepare must equal the allowlisted build command if
//        present.
//        Codes: DEPS_FORBIDDEN, OPTIONAL_DEPS_FORBIDDEN, SCRIPT_HOOK_FORBIDDEN,
//               PREPARE_NOT_ALLOWLISTED.
//   3. devdeps-pin — every devDependencies value must be an exact registry
//        version; ranges and non-registry sources are forbidden.
//        Codes: DEVDEP_RANGE_FORBIDDEN, DEVDEP_NON_REGISTRY.
//   4. executable-allowlist — files with mode 0o111 OR a shebang OR an
//        executable extension (.sh .py .mjs .cjs .js) must live under
//        bin/, scripts/, .claude/hooks/, or .claude/skills/*/.
//        Codes: SURPRISE-EXECUTABLE.
//
// Exit 0: every sub-check clean. Exit 1: any violation.

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { statSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PREPARE_ALLOWLISTED = 'bash scripts/build-template.sh';
const FORBIDDEN_SCRIPT_HOOKS = ['preinstall', 'install', 'postinstall'];
const EXECUTABLE_EXTENSIONS = new Set(['.sh', '.py', '.mjs', '.cjs', '.js']);
const EXECUTABLE_PATH_ALLOWLIST = [
  /^bin\//,
  /^scripts\//,
  /^\.claude\/hooks\//,
  /^\.claude\/skills\/[^/]+\//,
  /^obj\/template\/\.claude\/hooks\//,
  /^obj\/template\/\.claude\/skills\/[^/]+\//,
];

const DEVDEP_RANGE_TOKENS = ['^', '~', '*', '>', '<', '||', ' ', 'x'];
const DEVDEP_NON_REGISTRY_PREFIXES = ['github:', 'git:', 'git+', 'http:', 'https:', 'file:', 'link:', 'npm:'];

function readPackageJson(cwd) {
  return JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
}

function packDryRun(cwd) {
  // --ignore-scripts: do NOT run `prepack` here. The publish:check orchestrator
  // runs `npm publish --dry-run` first (which DOES run prepack); by the time
  // files-diff runs, obj/template/ is already freshly built. Running prepack
  // again would wipe and rebuild it, which (a) is redundant and (b) makes the
  // executable-allowlist check uncatchable by tests that inject a file under
  // obj/template/ as a TanStack-style injection scenario.
  const out = execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].files) ? parsed[0].files : [];
}

function prefixCovers(prefix, file) {
  if (prefix.endsWith('/')) return file === prefix.slice(0, -1) || file.startsWith(prefix);
  return file === prefix;
}

function isImplicitlyIncluded(file) {
  if (file === 'package.json') return true;
  if (/^README(\.[^/]*)?$/i.test(file)) return true;
  if (/^LICEN[SC]E(\.[^/]*)?$/i.test(file)) return true;
  return false;
}

function checkFilesSymmetric(pkg, packedPaths) {
  const declared = Array.isArray(pkg.files) ? pkg.files : [];
  const violations = [];
  for (const prefix of declared) {
    if (!packedPaths.some((f) => prefixCovers(prefix, f))) {
      violations.push(`DECLARED-NOT-PACKED: ${prefix}`);
    }
  }
  for (const file of packedPaths) {
    if (isImplicitlyIncluded(file)) continue;
    if (!declared.some((prefix) => prefixCovers(prefix, file))) {
      violations.push(`PACKED-NOT-DECLARED: ${file}`);
    }
  }
  return { violations, declaredCount: declared.length };
}

// Runtime dependency allowlist. The baseline ships exactly one runtime dep:
// @clack/prompts, the prompt primitives behind the branded TUI in src/cli/tui/*.
// Any other top-level `dependencies` entry is a supply-chain expansion that
// requires a spec amendment + update to this allowlist.
const DEPS_ALLOWLIST = new Set(['@clack/prompts']);

function checkPackageIntegrity(pkg) {
  const violations = [];
  const deps = pkg.dependencies || {};
  const unsanctioned = Object.keys(deps).filter((name) => !DEPS_ALLOWLIST.has(name));
  if (unsanctioned.length > 0) {
    violations.push(`DEPS_FORBIDDEN: only the allowlist may appear in dependencies; unsanctioned: ${unsanctioned.join(', ')}`);
  }
  if (pkg.optionalDependencies && Object.keys(pkg.optionalDependencies).length > 0) {
    for (const name of Object.keys(pkg.optionalDependencies)) {
      violations.push(`OPTIONAL_DEPS_FORBIDDEN: ${name}`);
    }
  }
  const scripts = pkg.scripts || {};
  for (const hook of FORBIDDEN_SCRIPT_HOOKS) {
    if (typeof scripts[hook] === 'string') {
      violations.push(`SCRIPT_HOOK_FORBIDDEN: ${hook}=${JSON.stringify(scripts[hook])}`);
    }
  }
  if (typeof scripts.prepare === 'string' && scripts.prepare !== PREPARE_ALLOWLISTED) {
    violations.push(`PREPARE_NOT_ALLOWLISTED: prepare=${JSON.stringify(scripts.prepare)} (allowlisted: ${JSON.stringify(PREPARE_ALLOWLISTED)})`);
  }
  return { violations };
}

function classifyDevDepValue(value) {
  if (typeof value !== 'string') return { kind: 'unsupported', detail: typeof value };
  for (const prefix of DEVDEP_NON_REGISTRY_PREFIXES) {
    if (value.startsWith(prefix)) return { kind: 'non-registry', detail: value };
  }
  for (const token of DEVDEP_RANGE_TOKENS) {
    if (value.includes(token)) return { kind: 'range', detail: value };
  }
  return { kind: 'exact' };
}

function checkDevDepsPin(pkg) {
  const violations = [];
  const devDeps = pkg.devDependencies || {};
  for (const [name, value] of Object.entries(devDeps)) {
    const result = classifyDevDepValue(value);
    if (result.kind === 'range') {
      violations.push(`DEVDEP_RANGE_FORBIDDEN: ${name}=${result.detail}`);
    } else if (result.kind === 'non-registry') {
      violations.push(`DEVDEP_NON_REGISTRY: ${name}=${result.detail}`);
    } else if (result.kind === 'unsupported') {
      violations.push(`DEVDEP_RANGE_FORBIDDEN: ${name} (unsupported type ${result.detail})`);
    }
  }
  return { violations };
}

function fileLooksExecutable(absPath, relPath) {
  // A packed file is treated as executable when EITHER the filesystem mode has
  // any of the user/group/world execute bits set OR the file begins with a
  // shebang (#!). Extension alone is informational, not gating — pure library
  // modules like src/cli/*.js carry no exec bit and no shebang and are
  // legitimately allowed outside bin/scripts/hooks/skills allowlists.
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return false;
  }
  if ((stat.mode & 0o111) !== 0) return true;
  const ext = path.extname(relPath).toLowerCase();
  if (!EXECUTABLE_EXTENSIONS.has(ext)) return false;
  try {
    const head = readFileSync(absPath, { encoding: 'utf8', flag: 'r' }).slice(0, 2);
    return head === '#!';
  } catch {
    return false;
  }
}

function isPathAllowlistedExecutable(relPath) {
  return EXECUTABLE_PATH_ALLOWLIST.some((re) => re.test(relPath));
}

function checkExecutableAllowlist(cwd, packedPaths) {
  const violations = [];
  for (const rel of packedPaths) {
    const abs = path.join(cwd, rel);
    if (!fileLooksExecutable(abs, rel)) continue;
    if (isPathAllowlistedExecutable(rel)) continue;
    if (isImplicitlyIncluded(rel)) continue;
    violations.push(`SURPRISE-EXECUTABLE: ${rel} (not under bin/, scripts/, .claude/hooks/, .claude/skills/*/)`);
  }
  return { violations };
}

function runAllChecks(cwd) {
  const pkg = readPackageJson(cwd);
  let packedFiles;
  try {
    packedFiles = packDryRun(cwd);
  } catch (err) {
    console.error(`files-diff: 'npm pack --dry-run --json' failed: ${err.message}`);
    process.exit(2);
  }
  const packedPaths = packedFiles.map((f) => f.path);
  const violations = [
    ...checkPackageIntegrity(pkg).violations,
    ...checkDevDepsPin(pkg).violations,
    ...checkFilesSymmetric(pkg, packedPaths).violations,
    ...checkExecutableAllowlist(cwd, packedPaths).violations,
  ];
  return { violations, declaredCount: (pkg.files || []).length, packedCount: packedPaths.length };
}

const cwd = process.cwd();
const { violations, declaredCount, packedCount } = runAllChecks(cwd);

if (violations.length === 0) {
  console.log(`files-diff: clean (${declaredCount} declared prefixes, ${packedCount} packed entries)`);
  process.exit(0);
}

for (const v of violations) console.error(v);
console.error(`files-diff: ${violations.length} violation(s)`);
process.exit(1);
