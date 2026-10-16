// The privacy guard hook: what it must block and what it must allow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
