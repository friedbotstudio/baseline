import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let mcp;
try {
  mcp = await import('../src/cli/mcp.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/mcp.js: ${err.message}`);
}

describe('deepMergeMcpServers', () => {
  it('target absent — write template verbatim', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const templateContent = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(written, templateContent);
  });

  it('target exists with no mcpServers — adds mcpServers wholesale', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const templateContent = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify({}, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(written.mcpServers, templateContent.mcpServers);
  });

  it('target has user-only server — preserved, baseline servers added', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const linearConfig = { command: 'npx', args: ['-y', 'linear-mcp'] };
    const templateContent = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        plantuml: { command: 'npx', args: ['-y', 'plantuml-mcp'] },
      },
    };
    const targetContent = {
      mcpServers: {
        linear: linearConfig,
      },
    };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify(targetContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.ok('linear' in written.mcpServers, 'linear should be preserved');
    assert.ok('context7' in written.mcpServers, 'context7 should be added');
    assert.ok('plantuml' in written.mcpServers, 'plantuml should be added');
    assert.deepEqual(written.mcpServers.linear, linearConfig, 'linear config should be byte-equal to original');
  });

  it('baseline server in target is refreshed from template (semantics: B-baseline-canonical)', async () => {
    // Names that appear in the template are baseline-canonical. The merge SHALL
    // refresh them from the template so users running --merge receive baseline
    // arg/env updates (e.g., the playwright --browser chrome --isolated fix).
    // Side-effect: a user who customized a baseline-named server loses that
    // customization. Customizations belong under a non-baseline name.
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const templatePlaywright = {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--browser', 'chrome', '--isolated'],
    };
    const stalePlaywright = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };

    const templateContent = { mcpServers: { playwright: templatePlaywright } };
    const targetContent = { mcpServers: { playwright: stalePlaywright } };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify(targetContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(
      written.mcpServers.playwright,
      templatePlaywright,
      'baseline-named server (playwright) must be refreshed from template'
    );
  });

  it('user-added server is preserved even when refreshing baseline servers in the same file', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const userLinear = { command: 'npx', args: ['-y', 'linear-mcp', '--token=secret'] };
    const templatePlaywright = {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--isolated'],
    };
    const stalePlaywright = { command: 'npx', args: ['-y', '@playwright/mcp@latest'] };

    const templateContent = { mcpServers: { playwright: templatePlaywright } };
    const targetContent = { mcpServers: { playwright: stalePlaywright, linear: userLinear } };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify(targetContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(written.mcpServers.playwright, templatePlaywright, 'baseline server refreshed');
    assert.deepEqual(written.mcpServers.linear, userLinear, 'user-added server preserved byte-for-byte');
  });

  it('never deletes a key', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const templateContent = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    };
    const targetContent = {
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify(targetContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.ok('github' in written.mcpServers, 'github key must not be deleted');
  });

  it('preserves non-mcpServers top-level keys in target', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const templatePath = join(tmp, 'template.json');
    const targetPath = join(tmp, 'target.json');

    const experimentalValue = { enabled: true, featureFlags: ['alpha'] };
    const templateContent = {
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
      },
    };
    const targetContent = {
      experimental: experimentalValue,
      mcpServers: {},
    };
    await writeFile(templatePath, JSON.stringify(templateContent, null, 2) + '\n');
    await writeFile(targetPath, JSON.stringify(targetContent, null, 2) + '\n');

    await mcp.deepMergeMcpServers(templatePath, targetPath);

    const written = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(written.experimental, experimentalValue, 'non-mcpServers top-level keys must be preserved');
  });
});
