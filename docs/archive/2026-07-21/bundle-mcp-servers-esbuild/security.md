# Security reports — bundle-mcp-servers-esbuild

## bundle-mcp-servers-esbuild-2026-07-21.md

# Security Review — bundle-mcp-servers-esbuild — 2026-07-21

## Summary

Overall risk: **LOW**. The change adds a build-time esbuild bundling stage for two first-party MCP servers and one build-time devDependency (`esbuild@0.28.1`). All inputs are pinned, in-repo, first-party files; there is no attacker-controllable data flow, no new runtime surface, and no new production dependency. `npm audit --omit=dev` reports **0 vulnerabilities** on the shipped surface. Both bundled artifacts are covered by the manifest sha256 (integrity). No CRITICAL/HIGH/MEDIUM findings; two LOW/informational notes below.

## Findings

### [LOW] Graceful esbuild-absent skip can ship raw (consumer-broken) servers
- **OWASP**: A04 - Insecure Design | **CWE**: CWE-754 (improper check of unusual condition)
- **File**: scripts/bundle-mcp-servers.mjs:78-83
- **Evidence**:
  ```
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      process.stderr.write('build: esbuild not installed — MCP servers shipped unbundled ...\n');
      return;
    }
  ```
- **Impact**: If a *real* publish build (`prepack`) ever ran without devDependencies installed, the stage would emit a stderr warning and ship the raw `server.mjs` (bare `@modelcontextprotocol/sdk` import), which crashes on a consumer install lacking the SDK. This is a **degradation**, not an exploit — no privilege or data exposure.
- **Why LOW / mitigated**: the raw source is byte-identical to what shipped *before* this change (no regression); the skip only triggers in the dependency-free structural-test clones (`clone-and-build.mjs` excludes `node_modules`), never in a real publish where `npm ci`/local devDeps are present; and the AC-003 tarball smoke test (`test_when_bundle_run_with_prod_deps_only_then_module_graph_resolves` + `publish:smoke`) fails on a raw-shipped server. The tolerance is required so structural-test builds pass.
- **Recommendation**: Optional hardening — have the *publish* path (`publish-check.sh` / `smoke-tarball.mjs`, not `prepack` itself) assert the shipped `server.mjs` is self-contained (`isSelfContained`) so a raw ship fails closed at the publish gate rather than only at first consumer launch. Keep `prepack` tolerant (test clones depend on it).

### [LOW] Inlined SDK + zod become shipped code frozen at bundle time
- **OWASP**: A06 - Vulnerable & Outdated Components | **CWE**: CWE-1104 (use of unmaintained third-party components)
- **File**: package.json:58 (`esbuild` devDep) → bundled output `obj/template/.claude/mcp/*/server.mjs`
- **Evidence**: `@modelcontextprotocol/sdk@1.29.0` + `zod` are inlined into the shipped bundle; their code is now frozen in the artifact until the next re-bundle.
- **Impact**: A future CVE in the SDK or zod does not surface via a consumer's `npm audit` (the code is inlined, not a dependency), so patching depends on the maintainer bumping the devDep and re-bundling.
- **Why LOW**: current `npm audit` is clean for both; the same currency responsibility already existed under the retired own-package plan; re-bundling is one devDep bump + rebuild.
- **Recommendation**: Keep the SDK/zod devDeps under Dependabot (already the repo's model) and treat a bump as a re-bundle trigger. No code change required now.

## Path-handling review (requested focus 2) — no finding

`bundleServers(templateDir)` joins `templateDir` with a **hardcoded** `target.entry` constant (`.claude/mcp/<server>/server.mjs`) from the module-level `TARGETS`. `templateDir` is `$TEMPLATE_DIR` (`obj/template`), fixed by `build-template.sh`, invoked only at build time by the maintainer/CI. Neither operand is external input, so there is no path-traversal surface (CWE-22 N/A). `absWorkingDir`/`nodePaths` resolve to the repo's own `node_modules`. No injection surface: `entryPoints`/`outfile` are file paths passed to esbuild's JS API (no shell), and there is no template/eval of untrusted content.

## Integrity review (requested focus 4) — covered

Both bundled `server.mjs` files are hashed into `obj/template/.claude/manifest.json` (verified: `sha256` present for `sprint-channel` and `sprint-pool`). Stage 1.7 runs before Stage 3 (manifest) unconditionally, so the manifest always reflects the bundled bytes; `smoke-tarball.mjs` re-verifies installed-tree hashes against the manifest at pack time. A08 (Software & Data Integrity) is satisfied — tamper of a shipped bundle is detectable, same as every other shipped file.

## Dependencies

- **esbuild@0.28.1** (NEW, devDependency) — `npm audit`: 0 vulnerabilities. Build-time only; never installed by consumers. Pure-JS, no post-install script executed at consumer time (it is not in the consumer dependency tree at all).
- **@modelcontextprotocol/sdk@1.29.0, zod** — existing devDeps, now inlined into the shipped bundle. `npm audit`: clean.
- Runtime `dependencies` unchanged: `{@clack/prompts@1.4.0}` (AC-005). Zero-runtime-dep invariant preserved.

## Out of scope / Noted

- `npm audit` (full, incl. dev) reports advisories in `undici`/`qs`/`tar` transitively under `semantic-release`/`@11ty/eleventy`. These are **devDependencies**, not shipped (`npm audit --omit=dev` is clean), pre-exist this change, and are unrelated to it — no action here.
- The tracked `.mcp.json` registration + MCP-server count cascade (S4) is out of scope per spec Decision D-4; when it lands, the consumer will launch `node .../server.mjs` — the bundle already reviewed here is what that entry points at.

