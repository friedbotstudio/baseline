#!/usr/bin/env node
// Deterministic tree walker: entry file -> components -> hooks -> services -> API URLs.
// No LLM in the loop. Emits a JSON tree + flat indexes for one-shot consumption.
//
// Usage:
//   node walk.mjs --page <file-or-route> [--repo <repoRoot>] [--no-cache] [--max-depth N]
//
// Output goes to stdout. Cache lives at .claude/skills/code-browser/cache/trees/<hash>.json.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(SKILL_DIR, "cache", "trees");
const REPO_ROOT_DEFAULT = resolve(SKILL_DIR, "..", "..", "..");

const args = parseArgs(process.argv.slice(2));
const repoRoot = args.repo ? resolve(args.repo) : REPO_ROOT_DEFAULT;
const conventionsPath = join(SKILL_DIR, "conventions.json");
const conventions = existsSync(conventionsPath)
  ? JSON.parse(readFileSync(conventionsPath, "utf8"))
  : defaultConventions();

if (!args.page) {
  console.error(
    "Usage: node walk.mjs --page <file-or-route> [--repo <repoRoot>] [--no-cache] [--max-depth N]"
  );
  process.exit(1);
}

const entryPath = resolveEntryPath(args.page);
if (!entryPath) {
  console.error(`Could not resolve entry: ${args.page}`);
  process.exit(2);
}

const useCache = !args["no-cache"];
const maxDepth = parseInt(args["max-depth"] || "10", 10);
const cacheFile = join(CACHE_DIR, `${hash(entryPath)}.json`);

if (useCache && existsSync(cacheFile)) {
  const cached = safeJSON(readFileSync(cacheFile, "utf8"));
  if (cached && isCacheFresh(cached)) {
    cached.cacheHit = true;
    process.stdout.write(JSON.stringify(cached, null, 2));
    process.exit(0);
  }
}

const visited = new Map();
const indexes = { byHook: {}, byService: {}, byApiCall: {}, byComponent: {} };
const tree = walkFile(entryPath, 0);

const result = {
  entry: relPath(entryPath),
  builtAt: Date.now(),
  summary: {
    filesVisited: visited.size,
    hooks: Object.keys(indexes.byHook).length,
    services: Object.keys(indexes.byService).length,
    apiCalls: Object.keys(indexes.byApiCall).length,
    components: Object.keys(indexes.byComponent).length,
  },
  indexes,
  visitedFiles: [...visited.keys()].map(relPath),
  tree,
};

if (useCache) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(result, null, 2));
}

process.stdout.write(JSON.stringify(result, null, 2));

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function defaultConventions() {
  return {
    pathAliases: { "@/": "src/" },
    layers: {
      page: { pattern: "^src/app/.+page\\.(tsx?|jsx?)$" },
      service: { prefix: ["src/services/"] },
      hook: { prefix: ["src/context/", "src/hooks/"] },
      context: { prefix: ["src/context/"] },
      component: { prefix: ["src/components/"] },
    },
    skipPrefixes: [
      "src/types/",
      "src/utils/",
      "src/constants/",
      "src/hocs/",
      "src/providers/",
    ],
    apiUrlPattern: "/api/",
  };
}

function hash(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function relPath(p) {
  return relative(repoRoot, p);
}

function safeJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isCacheFresh(cached) {
  if (!cached.builtAt || !Array.isArray(cached.visitedFiles)) return false;
  for (const rel of cached.visitedFiles) {
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) return false;
    if (statSync(abs).mtimeMs > cached.builtAt) return false;
  }
  return true;
}

function resolveEntryPath(p) {
  const abs = isAbsolute(p) ? p : resolve(repoRoot, p);
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    for (const f of ["page.tsx", "page.ts", "index.tsx", "index.ts"]) {
      const c = join(abs, f);
      if (existsSync(c)) return c;
    }
  }
  return null;
}

function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    base = resolve(dirname(fromFile), spec);
  } else {
    let aliased = null;
    for (const [alias, target] of Object.entries(conventions.pathAliases)) {
      if (spec.startsWith(alias)) {
        aliased = resolve(repoRoot, target + spec.slice(alias.length));
        break;
      }
    }
    if (!aliased) return null; // external module
    base = aliased;
  }
  const candidates = [
    base,
    base + ".tsx",
    base + ".ts",
    base + ".jsx",
    base + ".js",
    join(base, "index.tsx"),
    join(base, "index.ts"),
    join(base, "index.jsx"),
    join(base, "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"])\/\/[^\n]*/g, "$1");
}

function classify(abs) {
  const rel = relPath(abs);
  const { layers } = conventions;
  if (layers.page?.pattern && new RegExp(layers.page.pattern).test(rel))
    return "page";
  for (const [kind, def] of Object.entries(layers)) {
    if (kind === "page") continue;
    if (def.prefix?.some((p) => rel.startsWith(p))) {
      if (kind === "context" && /\b(hook|hooks)\.tsx?$/.test(rel)) return "hook";
      return kind;
    }
  }
  return "other";
}

function shouldSkipChild(abs) {
  const rel = relPath(abs);
  return conventions.skipPrefixes.some((p) => rel.startsWith(p));
}

function parseImports(src) {
  const imports = [];
  // Capture everything between `import` and `from`, then dissect it.
  // [\s\S] handles multi-line named lists.
  const re = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].replace(/^type\s+/, "").trim();
    const spec = m[2];
    let defaultName = null;
    let namespaceName = null;
    const namedNames = [];

    const namedMatch = names.match(/\{([\s\S]*?)\}/);
    if (namedMatch) {
      for (const part of namedMatch[1].split(",")) {
        const t = part.replace(/^type\s+/, "").trim();
        if (!t) continue;
        const last = t.split(/\s+as\s+/).pop().trim();
        if (last) namedNames.push(last);
      }
    }

    const nsMatch = names.match(/\*\s+as\s+([\w$]+)/);
    if (nsMatch) namespaceName = nsMatch[1];

    const cleaned = names
      .replace(/\{[\s\S]*?\}/, "")
      .replace(/\*\s+as\s+[\w$]+/, "")
      .replace(/,/g, " ")
      .trim();
    const defMatch = cleaned.match(/^([\w$]+)/);
    if (defMatch) defaultName = defMatch[1];

    imports.push({ spec, defaultName, namespaceName, namedNames });
  }
  return imports;
}

function isUsed(src, name) {
  if (!name) return false;
  const e = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(<${e}\\b)|(\\b${e}\\s*[\\(.<])|(\\b${e}\\b)`, "m").test(
    src
  );
}

function findRenderedComponents(src) {
  const out = new Set();
  // Require non-identifier before `<` (excludes generics like `React.FC<Foo>`)
  // and whitespace/slash/gt after the tag (excludes generic instantiations like `Array<Foo>`).
  const re = /(?<![\w$.])<([A-Z][\w$]*(?:\.[A-Z][\w$]*)?)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out];
}

function findHookCalls(src) {
  const out = new Set();
  const re = /\b(use[A-Z][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out];
}

function findHookExports(src) {
  const out = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+(use[A-Z][\w$]*)/g,
    /export\s+const\s+(use[A-Z][\w$]*)\s*[:=]/g,
    /export\s+default\s+(?:async\s+)?function\s+(use[A-Z][\w$]*)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return [...out];
}

function findDefaultExportName(src) {
  let m = /export\s+default\s+(?:async\s+)?function\s+([\w$]+)/.exec(src);
  if (m) return m[1];
  m = /export\s+default\s+([\w$]+)\s*;?\s*$/m.exec(src);
  if (m) return m[1];
  return null;
}

// Locate exported function declarations and their body spans. We need this for
// service files that export multiple named functions — each function owns its
// own URL+method and we want to attribute API calls per-function, not per-file.
function findExportedFunctions(src) {
  const functions = [];
  const re = /export\s+(?:(default)\s+)?(?:async\s+)?function\s+([\w$]+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const isDefault = !!m[1];
    const name = m[2];
    // The match ends at `(`. Find the matching `)`, then the next `{`, then its match.
    const parenOpen = m.index + m[0].length - 1;
    const parenClose = findMatching(src, parenOpen, "(", ")");
    if (parenClose === -1) continue;
    const bodyOpen = src.indexOf("{", parenClose);
    if (bodyOpen === -1) continue;
    const bodyClose = findMatching(src, bodyOpen, "{", "}");
    if (bodyClose === -1) continue;
    functions.push({
      name,
      isDefault,
      body: src.slice(bodyOpen, bodyClose + 1),
    });
  }
  return functions;
}

function findMatching(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findApiCalls(src) {
  const calls = [];
  const apiPrefix = conventions.apiUrlPattern.replace(/\//g, "\\/");
  // Three separate regexes so we don't break on template literals that contain
  // nested quotes (e.g. `?foo=${x || "ALL"}`). Each regex only excludes its own
  // quote character from the URL body.
  const backtickRe = new RegExp("`(" + apiPrefix + "[^`]+)`", "g");
  const doubleQuoteRe = new RegExp('"(' + apiPrefix + '[^"]+)"', "g");
  const singleQuoteRe = new RegExp("'(" + apiPrefix + "[^']+)'", "g");
  // Pre-scan all `method: "VERB"` literals so we can match each URL to the closest one.
  const methodRe = /method\s*:\s*["']([A-Z]+)["']/gi;
  const methods = [];
  let mm;
  while ((mm = methodRe.exec(src)))
    methods.push({ index: mm.index, method: mm[1].toUpperCase() });
  // Collect URLs from all three quote styles, dedupe by position.
  const urls = [];
  const seenAt = new Set();
  for (const re of [backtickRe, doubleQuoteRe, singleQuoteRe]) {
    let m;
    while ((m = re.exec(src))) {
      if (seenAt.has(m.index)) continue;
      seenAt.add(m.index);
      urls.push({ index: m.index, raw: m[1] });
    }
  }
  urls.sort((a, b) => a.index - b.index);
  const singleUrlSingleMethod = urls.length === 1 && methods.length === 1;
  for (const u of urls) {
    const url = u.raw.replace(/\$\{[^}]+\}/g, ":param");
    let method;
    if (singleUrlSingleMethod) {
      method = methods[0].method;
    } else {
      // Look for the closest method literal that follows the URL (URL-then-options pattern),
      // or precedes it within a tight window (rare). Widened window vs the old ±400 to
      // tolerate fetcher helpers that put the options object on the next statement.
      const after = methods.find(
        (mo) => mo.index > u.index && mo.index - u.index < 1500
      );
      const before = methods
        .filter((mo) => mo.index < u.index && u.index - mo.index < 300)
        .pop();
      method = after?.method || before?.method || null;
    }
    calls.push({ url, method: method || "GET", _methodInferred: !method });
  }
  const seen = new Set();
  return calls
    .filter((c) => {
      const k = `${c.method} ${c.url}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ _methodInferred, ...rest }) =>
      _methodInferred ? { ...rest, methodInferred: true } : rest
    );
}

function walkFile(abs, depth) {
  if (visited.has(abs)) {
    return { file: relPath(abs), kind: classify(abs), cyclic: true };
  }
  const kind = classify(abs);
  const node = { file: relPath(abs), kind };
  visited.set(abs, node);
  if (depth >= maxDepth) {
    node.truncated = true;
    return node;
  }

  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (e) {
    node.error = `read failed: ${e.message}`;
    return node;
  }
  const src = stripComments(raw);

  const rendered = findRenderedComponents(src);
  const hookCalls = findHookCalls(src);
  const hookExports = findHookExports(src);
  const apiCalls = findApiCalls(src);

  if (rendered.length) node.rendersComponents = rendered;
  if (hookCalls.length) node.usesHooks = hookCalls;
  if (hookExports.length) node.definesHooks = hookExports;
  if (apiCalls.length) node.apiCalls = apiCalls;

  // For service files, attribute URLs per exported function. Multi-function service
  // files are the leading cause of "model picked the wrong sibling URL" failures —
  // putting per-function entries in byService lets the model match by function name
  // (e.g. getExternalUserById → /internal_users/:id, distinct from getExternalUsers).
  if (kind === "service") {
    const defName = findDefaultExportName(src);
    if (defName) node.serviceName = defName;
    const fns = findExportedFunctions(src);
    if (fns.length) {
      node.serviceFunctions = fns.map((fn) => ({
        name: fn.name,
        isDefault: fn.isDefault,
        apiCalls: findApiCalls(fn.body),
      }));
    }
  }

  // Update flat indexes.
  for (const c of apiCalls) {
    indexes.byApiCall[`${c.method} ${c.url}`] = node.file;
  }
  for (const h of hookExports) {
    indexes.byHook[h] = indexes.byHook[h] || { file: node.file };
  }
  if (node.serviceFunctions?.length) {
    for (const fn of node.serviceFunctions) {
      // If a function has its own URLs, key byService by function name.
      // Single-function files still work: there's exactly one entry, keyed by that name.
      indexes.byService[fn.name] = {
        file: node.file,
        isDefault: fn.isDefault,
        apiCalls: fn.apiCalls,
      };
    }
  } else if (node.serviceName) {
    // Fallback for service files where findExportedFunctions found nothing
    // (e.g., arrow-function exports, unusual patterns).
    indexes.byService[node.serviceName] = {
      file: node.file,
      apiCalls: apiCalls,
    };
  }
  for (const c of rendered) {
    if (!indexes.byComponent[c]) indexes.byComponent[c] = node.file;
  }

  const imports = parseImports(src);
  const children = [];
  for (const imp of imports) {
    const resolved = resolveImport(imp.spec, abs);
    if (!resolved) continue;
    if (shouldSkipChild(resolved)) {
      // Note it as a leaf reference but don't recurse.
      children.push({
        file: relPath(resolved),
        kind: classify(resolved),
        importedAs: [imp.defaultName, ...imp.namedNames].filter(Boolean),
        skipped: true,
      });
      continue;
    }
    const symbols = [
      imp.defaultName,
      imp.namespaceName,
      ...imp.namedNames,
    ].filter(Boolean);
    // Always follow resolvable imports; skipPrefixes already filters the noisy layers.
    // Following "unused" imports is harmless: classify() and the indexes still produce
    // the right answers, and false negatives on "is used" silently break traces.
    const child = walkFile(resolved, depth + 1);
    if (symbols.length) child.importedAs = symbols;
    children.push(child);
  }
  if (children.length) node.children = children;
  return node;
}
