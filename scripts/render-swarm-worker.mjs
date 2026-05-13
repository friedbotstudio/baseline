#!/usr/bin/env node
// Render src/agents/swarm-worker.template.md by substituting the four baseline
// tokens — {{NAME}}, {{DESCRIPTION}}, {{SKILLS}}, {{ROLE_LINE}} — with their
// canonical baseline values, and write the result to the given output path.
//
// The same four tokens are re-substituted at /init-project time with
// project-specific {{SKILLS}} (baseline two + stack-specific additions).
// The canonical values below are mirrored verbatim in .claude/commands/init-project.md;
// when one changes, change both.
//
// Usage:
//   node scripts/render-swarm-worker.mjs <template-path> <output-path>

import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

const NAME = 'swarm-worker';

const DESCRIPTION = 'Execute a single swarm task in an isolated git worktree. Receive a fully-specified recipe from the main context — a scenario recipe plus an implementation contract — then run `Skill(scenario)` followed by `Skill(implement)` and report JSON status. Make no design decisions and do not expand scope. Invoked exclusively by `/swarm-dispatch`; never elsewhere.';

const SKILLS = '  - scenario\n  - implement';

const ROLE_LINE = 'You are a swarm worker. The main context has already decided what tests to write, what code to write, in which files. Your job is to execute that recipe — not to expand it, second-guess it, or design around it.';

async function main() {
  const [, , templatePath, outputPath] = argv;
  if (!templatePath || !outputPath) {
    process.stderr.write('Usage: render-swarm-worker.mjs <template-path> <output-path>\n');
    exit(2);
  }

  const tpl = await readFile(templatePath, 'utf8');

  const tokens = { '{{NAME}}': NAME, '{{DESCRIPTION}}': DESCRIPTION, '{{SKILLS}}': SKILLS, '{{ROLE_LINE}}': ROLE_LINE };
  let rendered = tpl;
  for (const [token, value] of Object.entries(tokens)) {
    if (!rendered.includes(token)) {
      process.stderr.write(`Template ${templatePath} is missing token ${token}\n`);
      exit(3);
    }
    rendered = rendered.split(token).join(value);
  }

  await writeFile(outputPath, rendered);
}

main().catch((err) => {
  process.stderr.write((err.stack || err.message) + '\n');
  exit(1);
});
