import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotebookLmCliProvider } from '../dist/infrastructure/notebooklm/notebook-lm-cli-provider.js';
import { NotebookLmCliRunner } from '../dist/infrastructure/notebooklm/notebook-lm-cli-runner.js';
import { notebookLmCliConfig } from '../dist/infrastructure/notebooklm/config.js';
import { ClientError } from '../dist/application/errors.js';

const code = expected => error => {
  assert.ok(error instanceof ClientError);
  assert.equal(error.code, expected);
  assert.doesNotMatch(error.message, /secret|traceback|cookie|token|storage_state/i);
  assert.equal(error.cause, undefined);
  return true;
};

test('provider maps create and source responses and uses explicit safe arguments once', async () => {
  const calls = [];
  const title = '--use $(touch secret); 中文';
  const url = 'https://www.youtube.com/watch?v=abc&x=1';
  const provider = new NotebookLmCliProvider({ run: async args => {
    calls.push(args);
    return args[0] === 'create'
      ? { notebook: { id: 'nb', title, role: 'owner' } }
      : { source: { id: 'src', type: 'youtube', notebook_id: 'nb', status: 'processing', url: null } };
  } });
  assert.deepEqual(await provider.createNotebook(title), { id: 'nb', title });
  assert.deepEqual(await provider.addYouTubeSource('nb', url), { id: 'src', url });
  assert.deepEqual(calls, [
    ['create', '--json', '--', title],
    ['source', 'add', '--notebook', 'nb', '--type', 'youtube', '--json', '--', url],
  ]);
});

test('missing response title falls back to requested title; source metadata may be absent', async () => {
  const provider = new NotebookLmCliProvider({ run: async args => args[0] === 'create'
    ? { notebook: { id: 'nb' } } : { source: { id: 'src' } } });
  assert.deepEqual(await provider.createNotebook('title'), { id: 'nb', title: 'title' });
  assert.deepEqual(await provider.addYouTubeSource('nb', 'url'), { id: 'src', url: 'url' });
});

test('unexpected create/source schemas fail at the provider boundary', async () => {
  for (const payload of [null, [], {}, { notebook: {} }, { notebook: { id: '' } },
    { notebook: { id: 123 } }, { notebook: { id: 'nb', title: null } }]) {
    await assert.rejects(new NotebookLmCliProvider({ run: async () => payload }).createNotebook('t'), code('NOTEBOOKLM_INVALID_RESPONSE'));
  }
  for (const payload of [{}, { source: null }, { source: { id: '' } },
    { source: { id: 'src', type: 'url' } }, { source: { id: 'src', status: 2 } },
    { source: { id: 'src', status: 'unknown' } }, { source: { id: 'src', notebook_id: 'other' } },
    { notebook_id: 'other', source: { id: 'src' } }]) {
    await assert.rejects(new NotebookLmCliProvider({ run: async () => payload }).addYouTubeSource('nb', 'url'), code('NOTEBOOKLM_INVALID_RESPONSE'));
  }
  for (const payload of [{ error: true }, { source: { id: 'src', status: 'error' } }]) {
    await assert.rejects(new NotebookLmCliProvider({ run: async () => payload }).addYouTubeSource('nb', 'url'), code('NOTEBOOKLM_BACKEND_ERROR'));
  }
});

test('provider rejects empty/NUL inputs without invoking runner', async () => {
  const provider = new NotebookLmCliProvider({ run: async () => assert.fail('must not run') });
  for (const input of ['', ' ', '\0']) {
    await assert.rejects(provider.createNotebook(input), code('CLI_INVALID_ARGUMENTS'));
    await assert.rejects(provider.addYouTubeSource(input, 'url'), code('CLI_INVALID_ARGUMENTS'));
    await assert.rejects(provider.addYouTubeSource('nb', input), code('CLI_INVALID_ARGUMENTS'));
  }
});

function fixture(t, script, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'nlyt runner '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(directory, 'fake cli');
  const storagePath = join(directory, 'state.json');
  writeFileSync(storagePath, '{}');
  writeFileSync(executable, `#!${process.execPath}\n${script}`, { mode: 0o700 });
  return { directory, runner: new NotebookLmCliRunner({ executable, storagePath, timeoutMs: 2000, ...overrides }) };
}

test('real execFile transports arguments and suppresses inline auth/debug, allowing harmless stderr', async t => {
  const { runner } = fixture(t, `console.error('secret diagnostic'); console.log(JSON.stringify({args: process.argv.slice(2), auth: process.env.NOTEBOOKLM_AUTH_JSON ?? null, debug: process.env.NOTEBOOKLM_DEBUG_RPC}));`);
  const result = await runner.run(['create', '--json', '--', '$(touch secret); 中文']);
  assert.equal(result.args[0], '--storage');
  assert.deepEqual(result.args.slice(2), ['--backend', 'web', '--quiet', 'create', '--json', '--', '$(touch secret); 中文']);
  assert.equal(result.auth, null);
  assert.equal(result.debug, '0');
});

for (const [name, script, expected] of [
  ['auth envelope', `console.log(JSON.stringify({error:true, code:'AUTH_REQUIRED', message:'secret cookie'})); process.exitCode=1;`, 'NOTEBOOKLM_AUTH_REQUIRED'],
  ['expired auth', `console.log(JSON.stringify({error:true, code:'AUTH_ERROR'})); process.exitCode=2;`, 'NOTEBOOKLM_AUTH_REQUIRED'],
  ['config envelope', `console.log(JSON.stringify({error:true, code:'CONFIG_ERROR'}));`, 'NOTEBOOKLM_CONFIG_INVALID'],
  ['zero-exit backend error', `console.log(JSON.stringify({error:true, code:'NETWORK_ERROR', message:'secret'}));`, 'NOTEBOOKLM_BACKEND_ERROR'],
  ['nested backend error', `console.log(JSON.stringify({error:{code:'RATE_LIMITED',message:'secret'}})); process.exitCode=1;`, 'NOTEBOOKLM_BACKEND_ERROR'],
  ['nonzero invalid stdout', `console.log('secret'); console.error('secret traceback'); process.exitCode=2;`, 'NOTEBOOKLM_PROCESS_ERROR'],
  ['nonzero valid stdout', `console.log('{}'); process.exitCode=9;`, 'NOTEBOOKLM_PROCESS_ERROR'],
  ['text auth fallback', `console.error('Authentication expired secret'); process.exitCode=1;`, 'NOTEBOOKLM_AUTH_REQUIRED'],
  ['invalid JSON', `console.log('secret');`, 'NOTEBOOKLM_INVALID_RESPONSE'],
  ['empty JSON', ``, 'NOTEBOOKLM_INVALID_RESPONSE'],
  ['signal termination', `process.kill(process.pid, 'SIGTERM');`, 'NOTEBOOKLM_PROCESS_ERROR'],
  ['output buffer limit', `process.stdout.write('x'.repeat(2*1024*1024));`, 'NOTEBOOKLM_PROCESS_ERROR'],
]) {
  test(`runner maps ${name} without exposing diagnostics or retrying`, async t => {
    const { runner, directory } = fixture(t, script);
    // Count invocations independently of stdout/stderr.
    const count = join(directory, 'count');
    const executable = join(directory, 'fake cli');
    writeFileSync(executable, `#!${process.execPath}\nimport {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(count)}, '1');\n${script}`, { mode: 0o700 });
    await assert.rejects(runner.run(['create', '--json', '--', 't']), code(expected));
    assert.equal(readFileSync(count, 'utf8'), '1');
  });
}

test('timeout kills a child even if it ignores SIGTERM', async t => {
  const { runner, directory } = fixture(t, `import {writeFileSync} from 'node:fs'; process.on('SIGTERM',()=>{}); setTimeout(()=>writeFileSync(process.argv.at(-1), 'survived'), 500); setInterval(()=>{},1000);`, { timeoutMs: 200 });
  const marker = join(directory, 'survivor');
  await assert.rejects(runner.run([marker]), code('NOTEBOOKLM_TIMEOUT'));
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.ok(!readdirSync(directory).includes('survivor'));
});

test('missing executable and unreadable executable map to configuration errors', async t => {
  const missing = fixture(t, '', { executable: '/nonexistent/nlyt-notebooklm' });
  await assert.rejects(missing.runner.run([]), code('NOTEBOOKLM_CONFIG_INVALID'));
  const denied = fixture(t, '');
  writeFileSync(join(denied.directory, 'not-executable'), '');
  const runner = new NotebookLmCliRunner({ executable: join(denied.directory, 'not-executable'), storagePath: join(denied.directory, 'state.json') });
  await assert.rejects(runner.run([]), code('NOTEBOOKLM_CONFIG_INVALID'));
});

test('missing auth state returns authentication error without spawning', async t => {
  const { runner } = fixture(t, `throw new Error('must not run')`, { storagePath: '/nonexistent/nlyt-state.json' });
  await assert.rejects(runner.run([]), code('NOTEBOOKLM_AUTH_REQUIRED'));
});

test('runner wraps synchronous process argument errors', async t => {
  const { runner } = fixture(t, '');
  await assert.rejects(runner.run(['\0secret']), code('NOTEBOOKLM_PROCESS_ERROR'));
});

test('directory auth state returns authentication error', async t => {
  const { directory } = fixture(t, '');
  const runner = new NotebookLmCliRunner({ storagePath: directory });
  await assert.rejects(runner.run([]), code('NOTEBOOKLM_AUTH_REQUIRED'));
});

test('config validates overrides and environment without reading credentials', t => {
  for (const override of [{ executable: '' }, { storagePath: '\0' }, { timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 1.5 }, { timeoutMs: 2**31 }]) {
    assert.throws(() => notebookLmCliConfig(override), code('NOTEBOOKLM_CONFIG_INVALID'));
  }
  const names = ['NOTEBOOKLM_CLI_PATH', 'NOTEBOOKLM_STORAGE_PATH', 'NOTEBOOKLM_TIMEOUT_MS'];
  const before = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => before[i] === undefined ? delete process.env[name] : process.env[name] = before[i]));
  process.env.NOTEBOOKLM_CLI_PATH = '/test/cli';
  process.env.NOTEBOOKLM_STORAGE_PATH = './test-state';
  process.env.NOTEBOOKLM_TIMEOUT_MS = '45000';
  const config = notebookLmCliConfig();
  assert.equal(config.executable, '/test/cli');
  assert.equal(config.timeoutMs, 45000);
  assert.equal(config.storagePath, join(process.cwd(), 'test-state'));
  names.forEach(name => delete process.env[name]);
  const defaults = notebookLmCliConfig();
  assert.equal(defaults.executable, 'notebooklm');
  assert.equal(defaults.timeoutMs, 60000);
  assert.match(defaults.storagePath, /\.notebooklm\/profiles\/default\/storage_state.json$/);
});

test('application/domain imports stay independent of infrastructure and subprocess', () => {
  for (const directory of ['src/application', 'src/domain']) {
    for (const name of readdirSync(directory, { recursive: true }).filter(name => name.endsWith('.ts'))) {
      const text = readFileSync(join(directory, name), 'utf8');
      assert.doesNotMatch(text, /(?:from|import\s*\()\s*['"][^'"]*(?:child_process|infrastructure|notebooklm-py)/);
      assert.doesNotMatch(text, /NotebookLmCliProvider|NotebookLmCliRunner|QueryTube\w*Dto/);
    }
  }
});
