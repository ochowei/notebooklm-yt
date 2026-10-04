import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

test('compiled CLI starts and describes Search Run commands', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });

  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /nlyt search-runs list --user/);
  assert.match(result.stdout, /nlyt search-runs get <runId> --user/);
  assert.match(result.stdout, /nlyt import search-run <runId>/);
  assert.equal(result.stderr, '');
});

const mockPath = fileURLToPath(new URL('./helpers/mock-fetch.mjs', import.meta.url));

function run(args, overrides = {}, cwd) {
  const result = spawnSync(process.execPath, ['--import', mockPath, cliPath, ...args], {
    encoding: 'utf8', cwd,
    env: { ...process.env, QUERYTUBE_BASE_URL: 'https://querytube.test', NLYT_TEST_RESPONSE: '', ...overrides },
  });
  assert.ifError(result.error);
  return result;
}

test('list --json is one clean JSON object containing internal references', () => {
  const result = run(['search-runs', 'list', '--user', 'user-1', '--json']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { items: [{ userId: 'user-1', searchRunId: 'run-1' }] });
});

test('get --json exposes only the minimal import source', () => {
  const result = run(['search-runs', 'get', 'run-1', '--user', 'user-1', '--json']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    userId: 'user-1', searchRunId: 'run-1',
    videos: [{ videoId: 'video-b', title: 'Title B', url: 'https://www.youtube.com/watch?v=video-b' }],
  });
});

test('human list and get are usable and successful empty responses are supported', () => {
  const list = run(['search-runs', 'list', '--user', 'user-1']);
  assert.equal(list.status, 0);
  assert.equal(list.stdout, 'run-1\n');
  const get = run(['search-runs', 'get', 'run-1', '--user', 'user-1']);
  assert.equal(get.status, 0);
  assert.match(get.stdout, /video-b\tTitle B\thttps:/);
  for (const command of [['list'], ['get', 'run-1']]) {
    const result = run(['search-runs', ...command, '--user', 'user-1', '--json'], { NLYT_TEST_RESPONSE: 'empty' });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), command[0] === 'list'
      ? { items: [] } : { userId: 'user-1', searchRunId: 'run-1', videos: [] });
  }
});

for (const [mock, expected] of [['404', 'QUERYTUBE_NOT_FOUND'], ['429', 'QUERYTUBE_RATE_LIMITED'],
  ['503', 'QUERYTUBE_UNAVAILABLE'], ['500', 'QUERYTUBE_HTTP_ERROR'], ['network', 'QUERYTUBE_NETWORK_ERROR'],
  ['malformed', 'QUERYTUBE_MALFORMED_JSON'], ['contract', 'QUERYTUBE_CONTRACT_INVALID']]) {
  test(`JSON CLI error ${expected} is machine-readable with a nonzero exit code`, () => {
    const result = run(['search-runs', 'get', 'run-1', '--user', 'user-1', '--json'], { NLYT_TEST_RESPONSE: mock });
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(payload), ['error']);
    assert.deepEqual(Object.keys(payload.error), ['code', 'message']);
    assert.equal(payload.error.code, expected);
    assert.equal(typeof payload.error.message, 'string');
    assert.doesNotMatch(payload.error.message, /upstream text/);
  });
}

test('missing base URL produces stable JSON configuration error', () => {
  const result = run(['search-runs', 'list', '--user', 'user-1', '--json'], { QUERYTUBE_BASE_URL: '' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).error.code, 'QUERYTUBE_CONFIG_MISSING');
});

function tempDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'nlyt-env-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI automatically reads base URL from .env in the current directory', t => {
  const cwd = tempDirectory(t);
  writeFileSync(join(cwd, '.env'), '# Local config\nQUERYTUBE_BASE_URL="https://querytube.test"\n');
  const result = run(['search-runs', 'list', '--user', 'user-1', '--json'], { QUERYTUBE_BASE_URL: undefined }, cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { items: [{ userId: 'user-1', searchRunId: 'run-1' }] });
});

test('existing environment takes precedence over .env', t => {
  const cwd = tempDirectory(t);
  writeFileSync(join(cwd, '.env'), 'QUERYTUBE_BASE_URL=invalid-url\n');
  const result = run(['search-runs', 'get', 'run-1', '--user', 'user-1', '--json'], {}, cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).searchRunId, 'run-1');
});

test('missing .env is optional but missing configuration still fails cleanly', t => {
  const cwd = tempDirectory(t);
  const args = ['search-runs', 'list', '--user', 'user-1', '--json'];
  assert.equal(run(args, {}, cwd).status, 0);
  const result = run(args, { QUERYTUBE_BASE_URL: undefined }, cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).error.code, 'QUERYTUBE_CONFIG_MISSING');
});

test('unreadable .env produces a clean JSON configuration error', t => {
  const cwd = tempDirectory(t);
  mkdirSync(join(cwd, '.env'));
  const result = run(['search-runs', 'list', '--user', 'user-1', '--json'], {}, cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).error.code, 'QUERYTUBE_CONFIG_INVALID');
});

test('CLI rejects missing and invalid arguments in JSON mode', () => {
  for (const args of [['search-runs', 'list'], ['search-runs', 'get', '--user', 'user-1'],
    ['search-runs', 'list', 'extra', '--user', 'user-1'], ['search-runs', 'get', 'r', '--user', ''],
    ['search-runs', 'list', '--user'], ['--unknown']]) {
    const result = run([...args, '--json']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).error.code, 'CLI_INVALID_ARGUMENTS');
  }
});

test('human errors go to stderr and leave stdout empty', () => {
  const result = run(['search-runs', 'get', 'run-1', '--user', 'user-1'], { NLYT_TEST_RESPONSE: '404' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /not found or is not public/);
});

test('CLI rejects an incomplete import command', () => {
  const result = spawnSync(process.execPath, [cliPath, 'import'], { encoding: 'utf8' });

  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLI_INVALID_ARGUMENTS/);
});
