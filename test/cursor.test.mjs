// Cursor plugin contract (R0 exit criteria: the same plugin works in Cursor).
// Cursor can't be driven headless, so this checks everything Cursor reads:
// the manifest's paths, the MCP server started exactly as mcp.json says,
// the skills' frontmatter, and the privacy hooks with Cursor-shaped input.
// A manual run in Cursor (docs/setup.md, "Release check in Cursor") is the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve('.');
const manifest = JSON.parse(fs.readFileSync('.cursor-plugin/plugin.json', 'utf8'));

test('Cursor manifest points at files that exist, with the same version as the package', () => {
  for (const k of ['skills', 'agents', 'rules', 'hooks', 'mcpServers']) assert.ok(fs.existsSync(path.join(ROOT, manifest[k])), `${k}: ${manifest[k]}`);
  assert.equal(manifest.version, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
  assert.equal(manifest.version, JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8')).version);
  for (const s of fs.readdirSync(manifest.skills)) {
    const md = fs.readFileSync(path.join(manifest.skills, s, 'SKILL.md'), 'utf8');
    assert.match(md, new RegExp(`^---\\nname: ${s}\\ndescription: .+\\n---`), `skills/${s}/SKILL.md frontmatter`);
  }
});

test('the MCP server starts exactly as mcp.json tells Cursor to, and answers', async () => {
  const cfg = JSON.parse(fs.readFileSync(manifest.mcpServers, 'utf8')).mcpServers.proofloop;
  assert.equal(cfg.type, 'stdio');
  const args = cfg.args.map((a) => a.replace('${CURSOR_PLUGIN_ROOT}', ROOT));
  assert.ok(fs.existsSync(args[0]), 'the built server exists (run npm run build)');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-'));
  const client = new Client({ name: 'cursor-contract', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args, cwd: home, env: { ...process.env, HOME: home } }));
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 28, `${tools.length} tools`);
    const r = await client.callTool({ name: 'setup_check', arguments: {} });
    assert.ok(!r.isError);
    assert.equal(JSON.parse(r.content[0].text).research_folder, 'not set up');
  } finally { await client.close(); fs.rmSync(home, { recursive: true, force: true }); }
});

test('Cursor hooks run the privacy guard on Cursor-shaped tool calls', () => {
  const hooks = JSON.parse(fs.readFileSync(manifest.hooks, 'utf8')).hooks.preToolUse;
  assert.ok(hooks.length >= 3);
  const S = 'research/savings-v1/sessions/P1';
  const cases = [
    ['Shell', { command: `cat ${S}/transcript.json` }, 2],
    ['Read', { target_file: `${S}/transcript.json` }, 2],
    ['Write', { file_path: `${S}/notes.md`, contents: 'x' }, 2],
    ['Grep', { pattern: '.', path: 'research', glob: 'transcript.json' }, 2],
    ['Read', { target_file: 'src/app.ts' }, 0],
    ['Shell', { command: 'npm test' }, 0],
  ];
  for (const h of hooks) {
    const [cmd, script] = h.command.split(' ');
    assert.equal(cmd, 'node');
    assert.ok(fs.existsSync(path.join(ROOT, script)), script);
  }
  for (const [tool, input, want] of cases) {
    const hook = hooks.find((h) => h.matcher === tool);
    assert.ok(hook, `a hook for ${tool}`);
    const r = spawnSync(process.execPath, [path.join(ROOT, hook.command.split(' ')[1])], { input: JSON.stringify({ hook_event_name: 'preToolUse', tool_name: tool, tool_input: input, cwd: '/work/app' }), encoding: 'utf8' });
    assert.equal(r.status, want, `${tool} ${JSON.stringify(input)}`);
  }
});
