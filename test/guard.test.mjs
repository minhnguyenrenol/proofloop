// The privacy guard hook: what it must block and what it must allow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const run = (tool_name, tool_input, cwd = '/work/app') => spawnSync(process.execPath, [path.resolve('hooks/guard.mjs')], { input: JSON.stringify({ tool_name, tool_input, cwd }), encoding: 'utf8' }).status;
const S = 'research/savings-v1/sessions';

test('guard blocks raw research data however the path is written', () => {
  const blocked = [
    ['Read', { file_path: `${S}/P1/media/screen.webm` }],
    ['Read', { file_path: `/work/app/${S}/P1/transcript.json` }],
    ['Read', { file_path: 'research\\savings-v1\\sessions\\P2\\transcript.json' }],
    ['Read', { file_path: 'studies/x/consent/P3.json' }],
    ['Read', { file_path: `${S}/P1/notes.md` }],
    ['Read', { file_path: 'research/.proofloop/exports/savings-v1-20261016T100000.tar.gz' }],
    ['Read', { file_path: 'research/savings-v1/consent/external-ids.json' }],
    ['Read', { file_path: 'transcript.json' }, `/work/app/${S}/P1`],
    ['Grep', { pattern: '.', path: S, glob: 'transcript.json' }],
    ['Grep', { pattern: '.', path: 'research/savings-v1/consent' }],
    ['Glob', { pattern: `${S}/P*/transcript.json` }],
    ['Bash', { command: `cat ${S}/P*/transcript.json` }],
    ['Bash', { command: `jq . ${S}/P1/transcript.json` }],
    ['Bash', { command: `python3 -c "print(open('${S}/P1/answers.json').read())"` }],
    ['Bash', { command: 'cat transcript.json' }, `/work/app/${S}/P1`],
    ['Bash', { command: `cp ${S}/P1/media/screen.webm /tmp/` }],
    ['Bash', { command: `ls ${S}/P1/media | xargs cat` }],
    ['Bash', { command: 'git add -f research/savings-v1' }],
    ['Bash', { command: `find ${S} -name '*.webm' -exec cat {} +` }],
  ];
  for (const [t, i, cwd] of blocked) assert.equal(run(t, i, cwd), 2, `${t} ${JSON.stringify(i)} should be blocked`);
});

test('guard allows normal work and the safe research files', () => {
  const allowed = [
    ['Read', { file_path: 'src/app.ts' }],
    ['Read', { file_path: `${S}/P1/analysis-input.json` }],
    ['Read', { file_path: `${S}/P1/observations.json` }],
    ['Read', { file_path: 'research/savings-v1/report.md' }],
    ['Grep', { pattern: 'rate', path: 'research' }],
    ['Grep', { pattern: 'rate', path: S, glob: 'observations.json' }],
    ['Bash', { command: 'npm test' }],
    ['Bash', { command: `ls -la ${S}/P1/media` }],
    ['Bash', { command: `du -sh ${S}` }],
    ['Bash', { command: 'git add . && git commit -m "x"' }],
    ['Bash', { command: 'git status' }, `/work/app/${S}`],
  ];
  for (const [t, i, cwd] of allowed) assert.equal(run(t, i, cwd), 0, `${t} ${JSON.stringify(i)} should be allowed`);
});

test('guard covers file-writing tools in both Claude Code and Cursor', () => {
  for (const [t, i] of [
    ['Write', { file_path: `${S}/P1/notes.md`, content: 'x' }],
    ['Edit', { file_path: `${S}/P1/transcript.json`, old_string: 'a', new_string: 'b' }],
    ['MultiEdit', { file_path: 'research/savings-v1/consent/P1.json', edits: [] }],
  ]) assert.equal(run(t, i), 2, `${t} should be blocked`);
  assert.equal(run('Write', { file_path: 'research/savings-v1/guide.md', content: 'x' }), 0);
  const claude = JSON.parse(fs.readFileSync('hooks/hooks.json', 'utf8')).hooks.PreToolUse[0].matcher.split('|');
  for (const t of ['Read', 'Bash', 'Grep', 'Glob', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']) assert.ok(claude.includes(t), `Claude Code matcher has ${t}`);
  const cursor = JSON.parse(fs.readFileSync('cursor/hooks.json', 'utf8')).hooks.preToolUse.map((h) => h.matcher);
  for (const t of ['Shell', 'Read', 'Grep', 'Glob', 'Write', 'Edit']) assert.ok(cursor.includes(t), `Cursor matcher has ${t}`);
});

test('guard expands wildcards that hide the folder name', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  try {
    const sd = path.join(tmp, 'research', 'savings-v1');
    fs.mkdirSync(path.join(sd, 'sessions', 'P1'), { recursive: true });
    fs.writeFileSync(path.join(sd, 'sessions', 'P1', 'transcript.json'), '{}');
    fs.writeFileSync(path.join(sd, 'study.yaml'), 'x');
    assert.equal(run('Bash', { command: 'cat research/*/s*/P1/transcript.json' }, tmp), 2);
    assert.equal(run('Bash', { command: 'cat research/savings-v1/se?sions/P1/trans*' }, tmp), 2);
    assert.equal(run('Bash', { command: 'head research/*/s*ions/*/*.json' }, tmp), 2);
    assert.equal(run('Bash', { command: 'cat research/*/study.yaml' }, tmp), 0, 'wildcards that only match safe files are fine');
    assert.equal(run('Bash', { command: 'ls research/*/s*' }, tmp), 0, 'listing is fine');
    // Odd wildcards never crash the guard open, and stay fast.
    const t0 = Date.now();
    for (const odd of ['/tmp/[z-a].json', 'research/*/{*,x}/P1/transcript.json', `/Users/${'*'.repeat(12)}X`, 'research/*/{r..t}essions/P1/transcript.json', 'research/{x,{savings-v1,y}}/sessions/P1/transcript.json']) {
      assert.equal(run('Bash', { command: `cat research/savings-v1/sessions/P1/transcript.json ${odd}` }, tmp), 2, odd);
    }
    for (const odd of ['/tmp/[z-a].json', `/Users/${'*'.repeat(12)}X`, 'research/*/{r..t}x/y.json']) assert.equal(run('Bash', { command: `cat ${odd}` }, tmp), 0, `${odd} alone is checked, not crashed`);
    assert.equal(run('Bash', { command: 'cat research/*/{s*,x}/P1/transcript.json' }, tmp), 2, 'braces');
    assert.equal(run('Bash', { command: 'cat research/savings-v1/SESSIONS/P1/TRANSCRIPT.json' }, tmp), 2, 'case-insensitive');
    assert.equal(run('Bash', { command: 'cd research/savings-v1 && cat s*/P1/t*' }, tmp), 2, 'after cd');
    assert.equal(run('Bash', { command: 'cd research/savings-v1/sessions/P1 && cat transcript.json' }, tmp), 2, 'cd into a session');
    assert.ok(Date.now() - t0 < 8000, 'fast');
    // Grep with a glob ignores .ignore files, so the glob is checked too.
    assert.equal(run('Grep', { pattern: '.', path: 'research', glob: '*.json' }, tmp), 2);
    assert.equal(run('Grep', { pattern: '.', path: 'research', glob: 'analysis-input.json' }, tmp), 0);
    assert.equal(run('Grep', { pattern: '.', path: 'research', glob: '*.yaml' }, tmp), 0);
    // Folders named sessions/ or consent/ outside a research folder are ordinary code.
    const app = path.join(tmp, 'app');
    fs.mkdirSync(path.join(app, 'src', 'consent'), { recursive: true });
    fs.mkdirSync(path.join(app, 'src', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(app, 'src', 'consent', 'en.json'), '{}');
    for (const cmd of ['git add src/*', 'grep -rn sessions src/', 'git commit -m "fix consent banner"', 'git add src/sessions', 'cd src/sessions && npm test', 'cat src/consent/en.json']) assert.equal(run('Bash', { command: cmd }, app), 0, cmd);
    assert.equal(run('Grep', { pattern: 'x', path: 'src/sessions' }, app), 0);

    // Bypasses closed: a newline starts a second command; file -f reads names out of a file; cd chains.
    fs.mkdirSync(path.join(sd, 'sessions', 'P1', 'media'), { recursive: true });
    assert.equal(run('Bash', { command: 'ls research/savings-v1/sessions/P1/media\ncat research/savings-v1/sessions/P1/transcript.json' }, tmp), 2, 'newline');
    assert.equal(run('Bash', { command: 'file -f research/savings-v1/sessions/P1/transcript.json' }, tmp), 2, 'file -f');
    assert.equal(run('Bash', { command: 'cd re*; cd sa*; cd s*; cd P*; cat transcript.json' }, tmp), 2, 'chained cd');
    assert.equal(run('Bash', { command: `cat ${'a'.repeat(100000)} research/savings-v1/sessions/P1/transcript.json` }, tmp), 2, 'huge word');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
