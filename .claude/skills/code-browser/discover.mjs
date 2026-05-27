#!/usr/bin/env node
// One-shot discovery: scan the repo, learn its conventions, write two files:
//   - conventions.json  (machine-readable; consumed by walk.mjs)
//   - conventions.md    (human/LLM-readable summary)
//
// Run once per repo, or after a major refactor that moves the layer dirs.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SKILL_DIR, "..", "..", "..");

const args = parseArgs(process.argv.slice(2));
const repoRoot = args.repo ? resolve(args.repo) : REPO_ROOT;

const tsconfig = readJSON(join(repoRoot, "tsconfig.json"));
const pkg = readJSON(join(repoRoot, "package.json"));

const pathAliases = extractAliases(tsconfig);
const framework = detectFramework(pkg);
const layers = inferLayers(repoRoot);
const apiUrlPattern = detectApiPrefix(repoRoot, layers);

const conventions = {
  framework,
  pathAliases,
  layers: {
    page: layers.page,
    service: layers.service,
    hook: layers.hook,
    context: layers.context,
    component: layers.component,
  },
  skipPrefixes: [
    "src/types/",
    "src/utils/",
    "src/constants/",
    "src/hocs/",
    "src/providers/",
  ].filter((p) => existsSync(join(repoRoot, p))),
  apiUrlPattern,
};

writeFileSync(
  join(SKILL_DIR, "conventions.json"),
  JSON.stringify(conventions, null, 2)
);
writeFileSync(join(SKILL_DIR, "conventions.md"), renderMarkdown(conventions));

console.log("Wrote conventions.json and conventions.md");
console.log(JSON.stringify(conventions, null, 2));

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
    } else out[key] = true;
  }
  return out;
}

function readJSON(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function extractAliases(tsc) {
  const out = {};
  const paths = tsc?.compilerOptions?.paths;
  if (!paths) return { "@/": "src/" };
  for (const [k, vArr] of Object.entries(paths)) {
    if (!Array.isArray(vArr) || !vArr.length) continue;
    const v = vArr[0];
    // Convert "@/*" -> "@/" and "./src/*" -> "src/"
    const alias = k.replace(/\*$/, "");
    const target = v.replace(/^\.\//, "").replace(/\*$/, "");
    out[alias] = target;
  }
  return Object.keys(out).length ? out : { "@/": "src/" };
}

function detectFramework(pkg) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (deps.next) return "nextjs";
  if (deps["@remix-run/react"]) return "remix";
  if (deps["react-router-dom"]) return "react-spa";
  if (deps.vue) return "vue";
  return "unknown";
}

function inferLayers(root) {
  const out = {
    page: { pattern: "^src/app/.+page\\.(tsx?|jsx?)$" },
    service: { prefix: ["src/services/"] },
    hook: { prefix: ["src/context/", "src/hooks/"] },
    context: { prefix: ["src/context/"] },
    component: { prefix: ["src/components/"] },
  };
  // Filter to those that actually exist.
  for (const def of Object.values(out)) {
    if (def.prefix) def.prefix = def.prefix.filter((p) => existsSync(join(root, p)));
  }
  return out;
}

function detectApiPrefix(root, layers) {
  const candidates = new Map();
  const servicePrefixes = layers.service?.prefix || [];
  for (const prefix of servicePrefixes) {
    const abs = join(root, prefix);
    if (!existsSync(abs)) continue;
    walk(abs, (file) => {
      if (!/\.(tsx?|jsx?)$/.test(file)) return;
      let src;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        return;
      }
      const re = /["'`](\/[a-z][a-z0-9_-]*\/[^"'`]*)["'`]/g;
      let m;
      while ((m = re.exec(src))) {
        const url = m[1];
        const seg = url.split("/").slice(1, 2)[0];
        if (!seg) continue;
        const key = `/${seg}/`;
        candidates.set(key, (candidates.get(key) || 0) + 1);
      }
    });
  }
  if (!candidates.size) return "/api/";
  const top = [...candidates.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return top;
}

function walk(dir, cb) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

function renderMarkdown(c) {
  const aliases = Object.entries(c.pathAliases)
    .map(([k, v]) => `- \`${k}\` → \`${v}\``)
    .join("\n");
  const prefixes = (def) => (def.prefix || []).map((p) => `\`${p}\``).join(", ");
  return `# Code conventions (auto-generated)

This file is generated by \`discover.mjs\`. It records the layer layout this skill assumes when walking the codebase.

## Framework
${c.framework}

## Path aliases
${aliases || "_(none)_"}

## Layers
- **Pages**: files matching \`${c.layers.page?.pattern || "n/a"}\`
- **Components**: ${prefixes(c.layers.component) || "_(none)_"}
- **Hooks**: ${prefixes(c.layers.hook) || "_(none)_"} (files named \`hook.ts\`/\`hook.tsx\` are treated as hooks even though they live under \`context/\`)
- **Context providers**: ${prefixes(c.layers.context) || "_(none)_"}
- **Services**: ${prefixes(c.layers.service) || "_(none)_"} (default export is the service function; the URL literal is extracted from the body)

## API URL prefix
\`${c.apiUrlPattern}\` — URL string literals starting with this prefix are recognised as backend API calls.

## Skipped on traversal
${c.skipPrefixes.map((p) => `- \`${p}\``).join("\n") || "_(none)_"}

These directories are noted in the tree as leaves but not recursed into — they almost never participate in UI-to-data flows.

## How to refresh
Re-run \`node .claude/skills/code-browser/discover.mjs\` after a refactor that moves any of the layer directories.
`;
}
