#!/usr/bin/env node
// smoke-tarball.mjs — end-to-end smoke test against the actual shipped tarball.
//
// Flow:
//   1. pack: real `npm pack --pack-destination <tmp>` (runs prepack)
//      OR if BROKEN_TARBALL env var is set, use that tarball directly (asserts
//      named missing file)
//      OR if TAMPERED_TARBALL env var is set, use that tarball directly (asserts
//      installed-tree hash verify catches single-byte tampering)
//   2. install: `npm install <tarball> --no-save --prefer-offline` in clean tmpdir
//   3. verify-installed-tree: walk installed-package/obj/template/** ; for each
//      file, compute sha256; compare against shipped manifest.files[<rel>] ;
//      first mismatch fails with `HASH_MISMATCH: <path>`.
//   4. exec: run the installed CLI against a fresh empty target dir
//   5. assert: target has .claude/.baseline-manifest.json and its hashes match
//      obj/template/.claude/manifest.json
//
// Exits 0 on clean smoke; non-zero with a named violation on fail.

import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const REPO = process.cwd();

function log(msg) {
  console.log(msg);
}

const cleanups = [];
process.on('exit', () => {
  for (const dir of cleanups) {
    try { execFileSync('rm', ['-rf', dir]); } catch {}
  }
});

function sha256File(abs) {
  const hash = createHash('sha256');
  hash.update(readFileSync(abs));
  return hash.digest('hex');
}

function verifyInstalledTreeHashes(installedPkg) {
  const manifestPath = path.join(installedPkg, 'obj/template/.claude/manifest.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: `obj/template/.claude/manifest.json missing inside installed package` };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const shippedFiles = manifest.files || {};
  const templateRoot = path.join(installedPkg, 'obj/template');
  // Iterate over manifest entries rather than disk: extra files on disk (e.g.,
  // AppleDouble `._*` metadata that macOS tar emits during repack) are not
  // part of the shipped baseline contract — that domain is files-diff. Hash
  // verify only asserts that every shipped file is byte-identical to what the
  // manifest recorded at pack time.
  const sortedEntries = Object.entries(shippedFiles).sort(([a], [b]) => a.localeCompare(b));
  for (const [rel, expected] of sortedEntries) {
    const abs = path.join(templateRoot, rel);
    if (!existsSync(abs)) {
      return { ok: false, reason: `HASH_MISMATCH: obj/template/${rel} (listed in shipped manifest but absent on disk)` };
    }
    const observed = sha256File(abs);
    if (observed !== expected) {
      return { ok: false, reason: `HASH_MISMATCH: obj/template/${rel} (shipped=${expected} observed=${observed})` };
    }
  }
  return { ok: true, count: sortedEntries.length };
}

async function main() {
  const brokenTarball = process.env.BROKEN_TARBALL;
  const tamperedTarball = process.env.TAMPERED_TARBALL;
  let tarballPath;

  if (brokenTarball) {
    log(`phase=pack source=BROKEN_TARBALL=${brokenTarball}`);
    tarballPath = brokenTarball;
  } else if (tamperedTarball) {
    log(`phase=pack source=TAMPERED_TARBALL=${tamperedTarball}`);
    tarballPath = tamperedTarball;
  } else {
    const packDir = await mkdtemp(path.join(os.tmpdir(), 'smoke-pack-'));
    cleanups.push(packDir);
    log(`phase=pack dir=${packDir}`);
    execFileSync('npm', ['pack', '--pack-destination', packDir], {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    const entries = (await readdir(packDir)).filter((e) => e.endsWith('.tgz'));
    if (entries.length !== 1) throw new Error(`expected 1 .tgz in ${packDir}, got ${entries.length}`);
    tarballPath = path.join(packDir, entries[0]);
    log(`phase=pack tarball=${tarballPath}`);
  }

  const installDir = await mkdtemp(path.join(os.tmpdir(), 'smoke-install-'));
  cleanups.push(installDir);
  log(`phase=install dir=${installDir}`);
  execFileSync('npm', ['install', tarballPath, '--no-save', '--prefer-offline'], {
    cwd: installDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });

  const installedPkg = path.join(installDir, 'node_modules/@friedbotstudio/create-baseline');
  const cliPath = path.join(installedPkg, 'bin/cli.js');
  if (!existsSync(cliPath)) {
    throw new Error(`installed CLI missing at ${cliPath}`);
  }

  // Baseline-required files that MUST be present in the installed package. The
  // CLI tolerates some absences via on-disk rebuild fallbacks (e.g.,
  // buildManifestFromDir if manifest.json is missing), but the ship contract is
  // that these specific files are present in the tarball. The smoke test asserts
  // the contract, not the fallback.
  const baselineRequiredInPackage = [
    'obj/template/.claude/manifest.json',
    'obj/template/CLAUDE.md',
    'obj/template/.mcp.json',
    'obj/template/docs/init/seed.md',
    'bin/cli.js',
  ];
  const missingInPackage = baselineRequiredInPackage.filter(
    (rel) => !existsSync(path.join(installedPkg, rel))
  );
  if (missingInPackage.length > 0) {
    console.error(`smoke FAILED: installed package is missing baseline-required files:`);
    for (const m of missingInPackage) console.error(`  named missing file: ${m}`);
    process.exit(1);
  }

  log(`phase=verify-installed-tree pkg=${installedPkg}`);
  const verifyResult = verifyInstalledTreeHashes(installedPkg);
  if (!verifyResult.ok) {
    console.error(`smoke FAILED: ${verifyResult.reason}`);
    process.exit(1);
  }
  log(`phase=verify-installed-tree ok=${verifyResult.count}`);

  const targetDir = await mkdtemp(path.join(os.tmpdir(), 'smoke-target-'));
  cleanups.push(targetDir);
  log(`phase=exec target=${targetDir}`);
  let execErr = null;
  try {
    execFileSync('node', [cliPath, targetDir, '--no-plantuml'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } catch (err) {
    execErr = err;
  }

  log(`phase=assert checks=manifest+sentinels`);

  const sentinels = ['.claude', 'CLAUDE.md', '.mcp.json', '.claude/.baseline-manifest.json'];
  const missing = sentinels.filter((s) => !existsSync(path.join(targetDir, s)));

  if (execErr || missing.length > 0) {
    console.error(`smoke FAILED: installed CLI did not produce a valid baseline at ${targetDir}`);
    if (execErr) {
      const stderr = (execErr.stderr || '').toString();
      const stdout = (execErr.stdout || '').toString();
      console.error(`  CLI stderr: ${stderr.slice(0, 1500)}`);
      console.error(`  CLI stdout: ${stdout.slice(0, 500)}`);
      const m = /(obj\/template\/[A-Za-z0-9_./-]+)/.exec(stderr + stdout);
      if (m) console.error(`  named missing file: ${m[1]}`);
    }
    if (missing.length > 0) console.error(`  missing sentinels: ${missing.join(', ')}`);
    process.exit(1);
  }

  const installedManifest = JSON.parse(await readFile(path.join(targetDir, '.claude/.baseline-manifest.json'), 'utf8'));
  const shippedManifest = JSON.parse(await readFile(path.join(REPO, 'obj/template/.claude/manifest.json'), 'utf8'));
  const installedFiles = installedManifest.files || {};
  const shippedFiles = shippedManifest.files || {};
  let mismatches = 0;
  for (const [p, hash] of Object.entries(shippedFiles)) {
    // The shipped manifest hashes itself? No — build-manifest.mjs self-skips
    // `.claude/manifest.json`. But the runtime `.baseline-manifest.json` also
    // records `.claude/manifest.json` (CLI hashes the target's full tree), so
    // both sides contain matching hashes for everything ELSE. Treat absence
    // of a shipped path on the installed side as a mismatch — keeps the
    // contract symmetric.
    if (installedFiles[p] !== hash) mismatches++;
  }
  if (mismatches > 0) {
    console.error(`smoke FAILED: ${mismatches} manifest-hash mismatches between installed and shipped`);
    process.exit(1);
  }

  log(`smoke PASSED: ${Object.keys(shippedFiles).length} manifest entries match`);
}

main().catch((err) => {
  const msg = err && err.stderr ? (err.stderr.toString() + err.message) : (err && err.message ? err.message : String(err));
  console.error(`smoke FAILED: ${msg}`);
  const m = /(obj\/template\/[A-Za-z0-9_./-]+)/.exec(msg);
  if (m) console.error(`  named missing file: ${m[1]}`);
  process.exit(1);
});
