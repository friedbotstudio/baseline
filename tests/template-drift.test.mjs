import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

// Files where `src/*.template.*` is the pristine ship-time copy AND must mirror the
// live working copy byte-for-byte. These are baseline-product files: the constitution,
// the baseline MCP server list, and the baseline hook wiring + settings keys. If they
// drift, user projects scaffolded via `npx create-baseline` ship outdated baseline product.
//
// NOT in this list (drift is intentional, with separate audit-baseline invariants):
//   - `.claude/project.json` — template is pristine `configured: false`; live is this
//     dev repo's own configured copy. Audit enforces `configured=false` on template.
//   - `docs/init/seed.md` — template carries the §16 reservation (pre-init shape);
//     live can have §16 populated by /init-project. Audit enforces pristine §16.
//   - `.claude/agents/swarm-worker.md` — template carries {{NAME}}/{{DESCRIPTION}}/
//     {{SKILLS}}/{{ROLE_LINE}} placeholders; build-template.sh renders them via
//     scripts/render-swarm-worker.mjs. Audit enforces placeholder presence.
//   - `.claude/memory/*.md` — templates are empty schemas; live has real entries.
const MIRROR_PAIRS = [
  { template: 'src/CLAUDE.template.md',     live: 'CLAUDE.md' },
  { template: 'src/settings.template.json', live: '.claude/settings.json' },
  { template: 'src/.mcp.template.json',     live: '.mcp.json' },
];

describe('template drift', () => {
  for (const { template, live } of MIRROR_PAIRS) {
    it(`${template} mirrors ${live}`, async () => {
      const [tpl, lv] = await Promise.all([
        readFile(join(ROOT, template), 'utf8'),
        readFile(join(ROOT, live), 'utf8'),
      ]);
      assert.equal(
        tpl,
        lv,
        `\nDrift detected: ${template} no longer matches ${live}.\n` +
        `Run:  cp ${live} ${template}\n` +
        `(or, if the live copy is wrong, edit it to match the template.)\n`
      );
    });
  }
});
