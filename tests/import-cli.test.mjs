import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { importReport } from '../dist/cli/import-output.js';
import { ClientError } from '../dist/application/errors.js';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const preload = fileURLToPath(new URL('./helpers/import-fetch.mjs', import.meta.url));
const args = ['import', 'search-run', 'run-1', '--user', 'user-1', '--title', '  --中文 $(echo test)  '];
const secret = 'secret cookie token traceback /credential/path private notebook';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'nlyt import '));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const executable = join(cwd, 'fake cli');
  const storage = join(cwd, 'state.json');
  const log = join(cwd, 'calls.jsonl');
  writeFileSync(storage, '{}');
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.NLYT_TEST_LOG, JSON.stringify(args) + '\\n');
console.error(${JSON.stringify(secret)});
const create = args[5] === 'create';
const mode = process.env.NLYT_TEST_BACKEND;
if ((create && ['auth', 'create'].includes(mode)) || (!create && (mode === 'all' || (mode === 'partial' && args.at(-1).endsWith('=b'))))) {
  console.log(JSON.stringify({ error: true, code: mode === 'auth' ? 'AUTH_REQUIRED' : 'NETWORK_ERROR', message: ${JSON.stringify(secret)} }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(create ? { notebook: { id: 'nb-1', title: args.at(-1) } } : { source: { id: 'src-' + args.at(-1).slice(-1), type: 'youtube' } }));
}
`, { mode: 0o700 });
  const run = (command = args, overrides = {}) => {
    const result = spawnSync(process.execPath, ['--import', preload, cli, ...command], {
      encoding: 'utf8', cwd, env: { ...process.env,
        QUERYTUBE_BASE_URL: 'https://querytube.test', NOTEBOOKLM_CLI_PATH: executable,
        NOTEBOOKLM_STORAGE_PATH: storage, NOTEBOOKLM_TIMEOUT_MS: '2000',
        NLYT_TEST_LOG: log, NLYT_TEST_BACKEND: '', NLYT_TEST_FETCH: '', ...overrides },
    });
    assert.ifError(result.error);
    assert.doesNotMatch(result.stdout + result.stderr, /secret|cookie|token|traceback|credential\/path|private notebook/);
    assert.ok(!(result.stdout + result.stderr).includes(storage));
    return result;
  };
  return { cwd, run, calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

for (const [mode, status, exit, succeeded] of [
  ['', 'success', 0, 3], ['partial', 'partial_failure', 2, 2], ['all', 'failure', 1, 0],
]) {
  for (const json of [false, true]) {
    test(`import ${status} ${json ? 'JSON' : 'human'} retains notebook and uses exit ${exit}`, t => {
      const { run, calls } = fixture(t);
      const result = run([...args, ...(json ? ['--json'] : [])], { NLYT_TEST_BACKEND: mode });
      assert.equal(result.status, exit);
      assert.equal(result.stderr, '');
      const commands = calls();
      assert.equal(commands.length, 4, 'one create, three adds; no retries/list/delete');
      const title = commands[0].at(-1);
      assert.ok(title.startsWith(args.at(-1) + ' ['));
      assert.match(title, / \[\d{2}-\d{4}\] \[NLYT-[A-Z0-9]{6}\]$/);
      assert.deepEqual(commands[0].slice(2), ['--backend', 'web', '--quiet', 'create', '--json', '--', title]);
      for (const [index, command] of commands.slice(1).entries()) {
        assert.deepEqual(command.slice(2), ['--backend', 'web', '--quiet', 'source', 'add', '--notebook', 'nb-1',
          '--type', 'youtube', '--json', '--', `https://www.youtube.com/watch?v=${['a', 'b', 'c'][index]}`]);
      }
      if (json) {
        const payload = JSON.parse(result.stdout);
        assert.deepEqual(Object.keys(payload), ['status', 'importId', 'createdAt', 'userId', 'searchRunId', 'notebook', 'sources', 'errors', 'skipped']);
        assert.equal(payload.status, status);
        assert.match(payload.importId, /^NLYT-[A-Z0-9]{6}$/);
        assert.equal(new Date(payload.createdAt).toISOString(), payload.createdAt);
        assert.ok(title.endsWith(`[${payload.importId}]`));
        assert.equal(payload.userId, 'user-1');
        assert.equal(payload.searchRunId, 'run-1');
        assert.deepEqual(payload.notebook, { title, created: true, id: 'nb-1' });
        assert.deepEqual(payload.sources, { total: 3, selected: 3, attempted: 3, succeeded, failed: 3 - succeeded, skipped: 0 });
        assert.equal(payload.errors.length, 3 - succeeded);
        for (const error of payload.errors) {
          assert.equal(error.code, 'NOTEBOOKLM_BACKEND_ERROR');
          assert.deepEqual(Object.keys(error), ['code', 'source']);
          assert.deepEqual(Object.keys(error.source).sort(), ['title', 'url', 'videoId']);
        }
        if (mode === 'partial') assert.equal(payload.errors[0].source.videoId, 'b');
      } else {
        for (const text of ['Import\n- id: ' + title.slice(-12, -1), '- created: ', 'Search Run\n- user: user-1\n- run: run-1', 'Notebook', '- created: yes',
          '- id: nb-1', `Sources\n- total: 3\n- selected: 3\n- attempted: 3\n- succeeded: ${succeeded}\n- failed: ${3 - succeeded}`,
          `Result\n- ${status.replace('_', ' ')}`]) assert.ok(result.stdout.includes(text));
      }
    });
  }
}

for (const [overrides, code, callCount] of [
  [{ QUERYTUBE_BASE_URL: '' }, 'QUERYTUBE_CONFIG_MISSING', 0],
  [{ QUERYTUBE_BASE_URL: 'invalid' }, 'QUERYTUBE_CONFIG_INVALID', 0],
  [{ NOTEBOOKLM_TIMEOUT_MS: '0' }, 'NOTEBOOKLM_CONFIG_INVALID', 0],
  [{ NOTEBOOKLM_STORAGE_PATH: '/nonexistent/state' }, 'NOTEBOOKLM_AUTH_REQUIRED', 0],
  [{ NOTEBOOKLM_CLI_PATH: '/nonexistent/cli' }, 'NOTEBOOKLM_CONFIG_INVALID', 0],
  [{ NLYT_TEST_FETCH: '404' }, 'QUERYTUBE_NOT_FOUND', 0],
  [{ NLYT_TEST_FETCH: 'unknown' }, 'QUERYTUBE_NETWORK_ERROR', 0],
  [{ NLYT_TEST_FETCH: 'empty' }, 'IMPORT_NO_SOURCES', 0],
  [{ NLYT_TEST_BACKEND: 'create' }, 'NOTEBOOKLM_BACKEND_ERROR', 1],
  [{ NLYT_TEST_BACKEND: 'auth' }, 'NOTEBOOKLM_AUTH_REQUIRED', 1],
]) {
  test(`fatal ${code} is stable in both modes`, t => {
    for (const json of [true, false]) {
      const { run, calls } = fixture(t);
      const result = run([...args, ...(json ? ['--json'] : [])], overrides);
      assert.equal(result.status, 1);
      assert.equal(calls().length, callCount);
      if (json) {
        assert.equal(result.stderr, '');
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.status, 'failure');
        assert.deepEqual(payload.errors, [{ code }]);
        const started = !['QUERYTUBE_CONFIG_MISSING', 'QUERYTUBE_CONFIG_INVALID'].includes(code)
          && overrides.NOTEBOOKLM_TIMEOUT_MS === undefined;
        if (started) {
          assert.match(payload.importId, /^NLYT-[A-Z0-9]{6}$/);
          assert.equal(new Date(payload.createdAt).toISOString(), payload.createdAt);
          assert.ok(payload.notebook.title.startsWith(args.at(-1) + ' ['));
          assert.ok(payload.notebook.title.endsWith(`[${payload.importId}]`));
          if (callCount) assert.equal(payload.notebook.title, calls()[0].at(-1));
        } else {
          assert.equal(payload.importId, null);
          assert.equal(payload.createdAt, null);
          assert.equal(payload.notebook.title, args.at(-1));
        }
        assert.equal(payload.notebook.created, false);
        assert.equal(payload.notebook.id, null);
        assert.deepEqual(payload.sources, { total: 0, selected: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0 });
      } else {
        assert.equal(result.stdout, '');
        assert.ok(result.stderr.includes(code));
        assert.match(result.stderr, /created: no \(not confirmed\)/);
      }
    }
  });
}

test('parser rejects incomplete, extra, unknown, empty and invalid path arguments before adapters', t => {
  const { run, calls } = fixture(t);
  for (const command of [[], ['import'], ['import', 'search-run'],
    ['import', 'search-run', 'run-1', '--user', 'user-1'],
    ['import', 'search-run', 'run-1', '--title', 'title'],
    [...args, 'extra'], [...args, '--unknown'], [...args, '--title'],
    ...['', ' \t', '.', '..'].map(value => ['import', 'search-run', value, '--user', 'user-1', '--title', 'title']),
    ...['', ' \t', '.', '..'].map(value => ['import', 'search-run', 'run-1', '--user', value, '--title', 'title']),
    ...['', ' \t'].map(value => ['import', 'search-run', 'run-1', '--user', 'user-1', '--title', value]),
  ].slice(1)) {
    const result = run([...command, '--json']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout).errors, [{ code: 'CLI_INVALID_ARGUMENTS' }]);
  }
  assert.deepEqual(calls(), []);
});

test('options before command and equals syntax preserve input and JSON output', t => {
  const { run } = fixture(t);
  const result = run(['--json', '--user=user-1', '--title=title', 'import', 'search-run', 'run-1']);
  assert.equal(result.status, 0);
  assert.ok(JSON.parse(result.stdout).notebook.title.startsWith('title ['));
});

test('import composition loads NotebookLM settings from .env with environment precedence', t => {
  const { cwd, run } = fixture(t);
  writeFileSync(join(cwd, '.env'), 'NOTEBOOKLM_TIMEOUT_MS=2000\nNOTEBOOKLM_CLI_PATH=/nonexistent/cli\n');
  assert.equal(run([...args, '--json'], { NOTEBOOKLM_TIMEOUT_MS: undefined }).status, 0);
});

test('presentation suppresses even ClientError messages and unknown errors', () => {
  for (const error of [new ClientError('NOTEBOOKLM_BACKEND_ERROR', secret), new Error(secret)]) {
    const report = importReport({}, undefined, error);
    assert.doesNotMatch(JSON.stringify(report), /secret|cookie|token|traceback/);
    assert.deepEqual(report.errors, [{ code: error instanceof ClientError ? error.code : 'INTERNAL_ERROR' }]);
  }
});

for (const [mode, videoIds, status, exit, succeeded, failed] of [
  ['', ['c', 'a', 'c'], 'success', 0, 2, 0],
  ['partial', ['b', 'a'], 'partial_failure', 2, 1, 1],
  ['all', ['c', 'a'], 'failure', 1, 0, 2],
]) {
  for (const json of [false, true]) {
    test(`CLI selected ${status} ${json ? 'JSON' : 'human'} includes skipped sources`, t => {
      const { run, calls } = fixture(t);
      const result = run([...args, ...videoIds.flatMap(id => ['--video', id]), ...(json ? ['--json'] : [])],
        { NLYT_TEST_BACKEND: mode });
      assert.equal(result.status, exit);
      assert.equal(result.stderr, '');
      const selected = mode === 'partial' ? ['a', 'b'] : ['a', 'c'];
      assert.equal(calls().length, 3, 'one create and two adds, no retry or rollback');
      assert.deepEqual(calls().slice(1).map(call => call.at(-1)), selected.map(id => `https://www.youtube.com/watch?v=${id}`));
      const skippedId = mode === 'partial' ? 'c' : 'b';
      if (json) {
        const payload = JSON.parse(result.stdout);
        assert.equal(payload.status, status);
        assert.deepEqual(payload.sources, { total: 3, selected: 2, attempted: 2, succeeded, failed, skipped: 1 });
        assert.deepEqual(payload.skipped, [{ reason: 'not_selected', source: {
          videoId: skippedId, title: skippedId, url: `https://www.youtube.com/watch?v=${skippedId}`,
        } }]);
        assert.equal(payload.errors.length, failed);
        assert.match(payload.importId, /^NLYT-[A-Z0-9]{6}$/);
        assert.equal(new Date(payload.createdAt).toISOString(), payload.createdAt);
        assert.equal(payload.notebook.created, true);
        assert.ok(payload.notebook.title.endsWith(`[${payload.importId}]`));
      } else {
        for (const text of ['- total: 3', '- selected: 2', '- attempted: 2', `- succeeded: ${succeeded}`,
          `- failed: ${failed}`, '- skipped: 1', `- skipped: not_selected (video: ${skippedId})`,
          `- ${status.replace('_', ' ')}`]) assert.ok(result.stdout.includes(text));
        if (failed) assert.ok(result.stdout.includes('NOTEBOOKLM_BACKEND_ERROR'));
      }
    });
  }
}

for (const json of [false, true]) {
  test(`CLI unknown selection ${json ? 'JSON' : 'human'} creates no notebook`, t => {
    const { run, calls } = fixture(t);
    const result = run([...args, '--video=unknown', ...(json ? ['--json'] : [])]);
    assert.equal(result.status, 1);
    assert.deepEqual(calls(), []);
    if (json) {
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(payload.errors, [{ code: 'IMPORT_INVALID_SELECTION' }]);
      assert.equal(payload.notebook.created, false);
      assert.equal(payload.skipped.length, 0);
    } else assert.ok(result.stderr.includes('IMPORT_INVALID_SELECTION'));
  });
}

test('video equals syntax works before command; missing value and search command video option reject', t => {
  const { run } = fixture(t);
  assert.equal(run(['--video=c', '--video=a', ...args, '--json']).status, 0);
  for (const command of [[...args, '--video', '--json'], ['search-runs', 'list', '--user=user-1', '--video=a', '--json']]) {
    const result = run(command);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes('CLI_INVALID_ARGUMENTS'));
  }
});
