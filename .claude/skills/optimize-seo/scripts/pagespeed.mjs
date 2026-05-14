#!/usr/bin/env node
/**
 * PageSpeed Insights audit helper.
 *
 * Wraps the PageSpeed Insights API for repeatable baseline + diff audits.
 * Reads G_PAGESPEED_KEY from .env.local at the project root.
 *
 * Usage:
 *   node pagespeed.mjs --url=https://friedbotstudio.com
 *   node pagespeed.mjs --url=https://friedbotstudio.com --output=/tmp/psi.json
 *   node pagespeed.mjs --url=https://friedbotstudio.com --baseline=/tmp/psi-baseline.json
 *
 * Flags:
 *   --url       Target URL to audit (required)
 *   --strategy  "mobile" | "desktop" | "both" (default: "both")
 *   --output    Write raw results to this JSON file
 *   --baseline  Compare against a previous --output file, print a diff table
 *   --silent    Suppress human-readable output (still writes --output if set)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- argv parsing ----------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

if (!args.url) {
  console.error("Error: --url is required");
  console.error("Usage: node pagespeed.mjs --url=https://example.com [--strategy=mobile|desktop|both] [--output=file] [--baseline=file]");
  process.exit(1);
}

const strategy = args.strategy || "both";
const strategies = strategy === "both" ? ["mobile", "desktop"] : [strategy];

// ---------- env loading ----------

function loadEnvKey() {
  if (process.env.G_PAGESPEED_KEY) return process.env.G_PAGESPEED_KEY;
  // Walk up looking for .env.local
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env.local");
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, "utf8");
      const match = content.match(/^G_PAGESPEED_KEY\s*=\s*(.+)$/m);
      if (match) return match[1].trim();
    }
    dir = resolve(dir, "..");
  }
  return null;
}

const apiKey = loadEnvKey();
if (!apiKey) {
  console.error("Error: G_PAGESPEED_KEY not found in environment or .env.local");
  process.exit(1);
}

// ---------- API call ----------

async function runAudit(url, strategy) {
  const params = new URLSearchParams({
    url,
    strategy,
    key: apiKey,
  });
  ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"].forEach((c) =>
    params.append("category", c)
  );

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PageSpeed API ${res.status}: ${text}`);
  }
  return res.json();
}

function extractSummary(raw) {
  const categories = raw.lighthouseResult?.categories ?? {};
  const audits = raw.lighthouseResult?.audits ?? {};

  const scores = {};
  for (const [id, cat] of Object.entries(categories)) {
    scores[id] = Math.round((cat.score ?? 0) * 100);
  }

  const failures = [];
  for (const audit of Object.values(audits)) {
    if (
      audit.score !== null &&
      audit.score < 1 &&
      !["informative", "notApplicable", "manual"].includes(audit.scoreDisplayMode)
    ) {
      failures.push({
        id: audit.id,
        title: audit.title,
        score: audit.score,
        severity: audit.score === 0 ? "FAIL" : "WARN",
        displayValue: audit.displayValue ?? null,
      });
    }
  }

  // Sort failures: FAIL first, then by score ascending
  failures.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "FAIL" ? -1 : 1;
    return a.score - b.score;
  });

  return { scores, failures };
}

// ---------- reporting ----------

function printSummary(results) {
  for (const [strategy, summary] of Object.entries(results)) {
    console.log(`\n=== ${strategy.toUpperCase()} ===`);
    console.log("Scores:");
    for (const [cat, score] of Object.entries(summary.scores)) {
      console.log(`  ${cat.padEnd(16)} ${score}`);
    }
    if (summary.failures.length) {
      console.log("\nFailing audits:");
      for (const f of summary.failures) {
        const display = f.displayValue ? ` — ${f.displayValue}` : "";
        console.log(`  [${f.severity}] ${f.title}${display}`);
      }
    }
  }
}

function printDiff(baseline, current) {
  console.log("\n=== DIFF (baseline → current) ===");
  for (const strategy of Object.keys(current)) {
    console.log(`\n${strategy.toUpperCase()}:`);
    const base = baseline[strategy]?.scores ?? {};
    const curr = current[strategy].scores;
    for (const cat of Object.keys(curr)) {
      const b = base[cat] ?? "—";
      const c = curr[cat];
      const delta = typeof b === "number" ? c - b : null;
      const arrow = delta === null ? "" : delta > 0 ? ` ▲ +${delta}` : delta < 0 ? ` ▼ ${delta}` : " =";
      console.log(`  ${cat.padEnd(16)} ${String(b).padEnd(4)} → ${String(c).padEnd(4)}${arrow}`);
    }

    const baseFailures = new Set((baseline[strategy]?.failures ?? []).map((f) => f.id));
    const currFailures = new Set(current[strategy].failures.map((f) => f.id));
    const resolved = [...baseFailures].filter((id) => !currFailures.has(id));
    const regressed = [...currFailures].filter((id) => !baseFailures.has(id));
    if (resolved.length) {
      console.log(`  Resolved: ${resolved.length}`);
      for (const id of resolved) console.log(`    ✓ ${id}`);
    }
    if (regressed.length) {
      console.log(`  Regressed: ${regressed.length}`);
      for (const id of regressed) console.log(`    ✗ ${id}`);
    }
  }
}

// ---------- main ----------

const results = {};
for (const s of strategies) {
  if (!args.silent) console.error(`Running ${s} audit for ${args.url}...`);
  const raw = await runAudit(args.url, s);
  results[s] = extractSummary(raw);
}

if (!args.silent) printSummary(results);

if (args.output) {
  writeFileSync(args.output, JSON.stringify(results, null, 2));
  if (!args.silent) console.log(`\nWrote results to ${args.output}`);
}

if (args.baseline) {
  if (!existsSync(args.baseline)) {
    console.error(`Baseline file not found: ${args.baseline}`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(args.baseline, "utf8"));
  printDiff(baseline, results);
}
