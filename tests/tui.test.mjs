import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { render } from 'ink-testing-library';
import { summaryDto, internalSummary } from './helpers/fixtures.mjs';
import { formatStartedAt, searchRunStatus, formatProgress } from '../dist/tui/presentation.js';
import { SearchRunList } from '../dist/tui/components/SearchRunList.js';
import { App } from '../dist/tui/App.js';
import { ImportSearchRunToNotebook } from '../dist/application/import-search-run-to-notebook.js';
import { ClientError } from '../dist/application/errors.js';

const keys = { down: '\u001b[B', up: '\u001b[A', enter: '\r', esc: '\u001b', backspace: '\u007f' };
const userId = 'user-1';
const runs = ['run-1', 'run-2'].map(searchRunId => internalSummary(userId, {
  ...summaryDto, id: searchRunId, querySetName: `WoW Forever Multilingual ${searchRunId}`,
}));
const videos = ['a', 'b', 'c'].map(videoId => ({ videoId, title: `Video ${videoId}`, url: `https://youtube.test/${videoId}` }));
const secret = 'secret stderr cookie /credential/path traceback';
const context = { clock: () => new Date('2026-10-04T08:09:31.123Z'), generateId: () => 'NLYT-A83K2F' };

async function waitFor(predicate, description = 'UI update') {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`Timed out: ${description}`);
}

function mount(t, options = {}) {
  const calls = { list: [], get: [], execute: [], create: [], add: [] };
  const queryTube = {
    listSearchRuns: async id => {
      calls.list.push(id);
      if (options.listError) throw options.listError;
      if (options.pendingList) return options.pendingList;
      return options.runs ?? runs;
    },
    getSearchRun: async (id, searchRunId) => {
      calls.get.push([id, searchRunId]);
      if (options.detailError) throw options.detailError;
      if (options.pendingDetail) return options.pendingDetail;
      return { userId: id, searchRunId, videos: options.videos ?? videos };
    },
  };
  const provider = {
    createNotebook: async title => {
      calls.create.push(title);
      if (options.createError) throw options.createError;
      return { id: 'nb-1', title };
    },
    addYouTubeSource: async (id, url) => {
      calls.add.push([id, url]);
      if (options.failAll || (options.partial && url.endsWith('/c'))) throw new ClientError('NOTEBOOKLM_BACKEND_ERROR', secret);
      return { id: `src-${calls.add.length}`, url };
    },
  };
  const useCase = new ImportSearchRunToNotebook(queryTube, provider, context);
  const createDependencies = () => {
    if (options.configError) throw options.configError;
    return { queryTube, importer: { execute: async (input, executionOptions) => {
      calls.execute.push(input);
      options.captureProgress?.(executionOptions.onProgress);
      if (options.pendingImport) return options.pendingImport;
      return useCase.execute(input, executionOptions);
    } } };
  };
  const app = render(createElement(App, { userId, createDependencies }));
  t.after(() => { app.unmount(); app.cleanup(); });
  const frame = () => app.lastFrame() ?? '';
  const screen = async text => waitFor(() => frame().includes(text), `${text}: ${frame()}`);
  const key = async value => { app.stdin.write(value); await delay(value === keys.esc ? 70 : 25); };
  return { app, calls, frame, screen, key };
}

async function selectRun(ui) {
  await ui.screen('QueryTube Search Runs');
  await ui.key(keys.enter);
  await ui.screen('Videos —');
}
async function confirm(ui, title = 'Research') {
  await ui.key(keys.enter);
  await ui.screen('Notebook title');
  await ui.key(title);
  await ui.key(keys.enter);
  await ui.screen('Ready to import');
}

test('startup renders loading; q exits without awaiting the pending list', async t => {
  let resolve;
  const ui = mount(t, { pendingList: new Promise(done => { resolve = done; }) });
  await ui.screen('Loading Search Runs');
  await waitFor(() => ui.calls.list.length === 1);
  await ui.key('q');
  const before = ui.app.frames.length;
  resolve(runs);
  await delay(40);
  assert.equal(ui.app.frames.length, before);
  assert.equal(ui.app.stdin.listenerCount('readable'), 0);
  assert.deepEqual(ui.calls.execute, []);
});

test('list navigation fetches only the selected detail; video shortcuts and Back preserve the run focus', async t => {
  const ui = mount(t);
  await ui.screen('QueryTube Search Runs');
  assert.deepEqual(ui.calls.list, [userId]);
  assert.deepEqual(ui.calls.get, []);
  assert.match(ui.frame(), /> .*WoW Forever Multilingual run-1/);
  await ui.key(keys.down);
  assert.match(ui.frame(), /> .*WoW Forever Multilingual run-2/);
  await ui.key(keys.up);
  assert.match(ui.frame(), /> .*WoW Forever Multilingual run-1/);
  await ui.key(keys.down);
  await ui.key(keys.enter);
  await ui.screen('Videos — run-2');
  assert.deepEqual(ui.calls.get, [[userId, 'run-2']]);
  assert.match(ui.frame(), /> \[x\] Video a/);
  await ui.key(' ');
  assert.match(ui.frame(), /> \[ \] Video a/);
  await ui.key(keys.down);
  await ui.key(' ');
  assert.match(ui.frame(), /> \[ \] Video b/);
  await ui.key(keys.up);
  await ui.key('a');
  assert.equal((ui.frame().match(/\[x\]/g) ?? []).length, 3);
  await ui.key('n');
  assert.equal((ui.frame().match(/\[ \]/g) ?? []).length, 3);
  await ui.key(keys.enter);
  await ui.screen('Select at least one video');
  assert.doesNotMatch(ui.frame(), /Ready to import/);
  assert.deepEqual(ui.calls.execute, []);
  await ui.key(keys.esc);
  await ui.screen('QueryTube Search Runs');
  assert.match(ui.frame(), /> .*WoW Forever Multilingual run-2/);
  assert.equal(ui.calls.list.length, 1);
});

test('title editing, back navigation, explicit confirmation, and exact application input', async t => {
  const ui = mount(t);
  await selectRun(ui);
  await ui.key('n');
  await ui.key(keys.down);
  await ui.key(' ');
  await ui.key(keys.enter);
  await ui.screen('Notebook title');
  await ui.key(keys.enter);
  await ui.screen('Enter a notebook title.');
  await ui.key('  Research q中x');
  await ui.key(keys.backspace);
  await ui.key(keys.enter);
  await ui.screen('Ready to import');
  assert.match(ui.frame(), /Selected: 1 \/ 3/);
  assert.match(ui.frame(), /Notebook: {3}Research q中/);
  assert.deepEqual(ui.calls.execute, []);
  assert.deepEqual(ui.calls.create, []);
  await ui.key(keys.esc);
  await ui.screen('Notebook title');
  await ui.key(keys.esc);
  await ui.screen('Videos —');
  assert.match(ui.frame(), /> \[x\] Video b/);
  await ui.key(keys.enter);
  await ui.key(keys.enter);
  await ui.screen('Ready to import');
  await ui.key(keys.enter);
  await ui.screen('Import complete');
  assert.deepEqual(ui.calls.execute, [{ userId, searchRunId: 'run-1', notebookTitle: '  Research q中', selection: { videoIds: ['b'] } }]);
  assert.equal(ui.calls.create.length, 1);
  assert.match(ui.calls.create[0], /^ {2}Research q中 \[\d{2}-\d{4}\] \[NLYT-A83K2F\]$/);
  assert.deepEqual(ui.calls.add, [['nb-1', videos[1].url]]);
  assert.match(ui.frame(), /skipped: 2/);
  assert.match(ui.frame(), /Import complete — success/);
  await ui.key(keys.enter);
  await ui.screen('QueryTube Search Runs');
  assert.equal(ui.calls.list.length, 1);
});

for (const outcome of ['resolve', 'reject']) {
  test(`importing blocks all navigation and repeated Enter, then handles ${outcome}`, async t => {
    let resolve;
    let reject;
    const pendingImport = new Promise((done, fail) => { resolve = done; reject = fail; });
    const ui = mount(t, { pendingImport });
    await selectRun(ui);
    await confirm(ui);
    ui.app.stdin.write(keys.enter);
    ui.app.stdin.write(keys.enter);
    await ui.screen('Creating Notebook...');
    assert.match(ui.frame(), /Import in progress. Exiting cannot safely cancel the operation./);
    const frame = ui.frame();
    const listeners = ui.app.stdin.listenerCount('readable');
    assert.ok(listeners > 0);
    for (const key of ['q', keys.esc, keys.enter, keys.down, keys.up, ' ', 'a', 'n']) {
      await ui.key(key);
      assert.equal(ui.frame(), frame, 'navigation must keep the importing screen');
      assert.equal(ui.app.stdin.listenerCount('readable'), listeners, 'TUI must remain mounted');
      assert.equal(ui.calls.execute.length, 1, 'execute must be called exactly once');
    }
    if (outcome === 'resolve') {
      resolve({ importId: 'NLYT-A83K2F', createdAt: '2026-10-04T08:09:31.123Z',
        notebook: { id: 'nb-1', title: 'Research' }, sources: videos.map(source => ({
          source, status: 'success', notebookSource: { id: `src-${source.videoId}`, url: source.url },
        })) });
      await ui.screen('Import complete — success');
      assert.match(ui.frame(), /succeeded: 3/);
      await ui.key(keys.enter);
    } else {
      reject(new ClientError('NOTEBOOKLM_BACKEND_ERROR', secret));
      await ui.screen('NOTEBOOKLM_BACKEND_ERROR');
      assert.match(ui.frame(), /NotebookLM could not confirm the operation./);
      assert.doesNotMatch(ui.frame(), /secret|cookie|traceback|credential/);
      await ui.key(keys.esc);
    }
    await ui.screen('QueryTube Search Runs');
    assert.equal(ui.calls.execute.length, 1);
    await ui.key('q');
    assert.equal(ui.app.stdin.listenerCount('readable'), 0, 'quit remains available after import settles');
  });
}

for (const [name, options, expected, succeeded, failed] of [
  ['success', {}, 'success', 2, 0],
  ['partial failure', { partial: true }, 'partial_failure', 1, 1],
  ['all selected failed', { failAll: true }, 'failure', 0, 2],
]) {
  test(`shared report: ${name} with skipped sources`, async t => {
    const ui = mount(t, options);
    await selectRun(ui);
    await ui.key(keys.down);
    await ui.key(' ');
    await confirm(ui);
    await ui.key(keys.enter);
    await ui.screen('Import complete');
    const frame = ui.frame();
    assert.match(frame, new RegExp(`Import complete — ${expected}`));
    for (const [label, value] of Object.entries({ total: 3, selected: 2, attempted: 2, succeeded, failed, skipped: 1 }))
      assert.match(frame, new RegExp(`${label}: ${value}`));
    if (failed) assert.match(frame, /c — NOTEBOOKLM_BACKEND_ERROR/);
    assert.doesNotMatch(frame, /secret|stderr|cookie|credential|traceback/);
    assert.equal(ui.calls.execute.length, 1);
    assert.equal(ui.calls.add.length, 2);
  });
}

test('empty public run list stays usable and cannot fetch detail', async t => {
  const ui = mount(t, { runs: [] });
  await ui.screen('No public Search Runs found.');
  await ui.key(keys.down);
  await ui.key(keys.enter);
  assert.deepEqual(ui.calls.get, []);
  await ui.key('q');
  assert.equal(ui.app.stdin.listenerCount('readable'), 0);
});

test('empty run reports existing IMPORT_NO_SOURCES and never writes', async t => {
  const ui = mount(t, { videos: [] });
  await ui.screen('QueryTube Search Runs');
  await ui.key(keys.enter);
  await ui.screen('IMPORT_NO_SOURCES');
  assert.match(ui.frame(), /no YouTube sources/);
  assert.deepEqual(ui.calls.create, []);
  await ui.key(keys.esc);
  await ui.screen('QueryTube Search Runs');
});

for (const code of ['QUERYTUBE_CONFIG_MISSING', 'QUERYTUBE_CONFIG_INVALID', 'QUERYTUBE_NETWORK_ERROR',
  'QUERYTUBE_NOT_FOUND', 'QUERYTUBE_CONTRACT_INVALID']) {
  test(`friendly QueryTube error ${code} never exposes diagnostics`, async t => {
    const ui = mount(t, { listError: new ClientError(code, secret) });
    await ui.screen(code);
    assert.doesNotMatch(ui.frame(), /secret|stderr|cookie|credential|traceback/);
    assert.deepEqual(ui.calls.execute, []);
    await ui.key('q');
  });
}

for (const code of ['NOTEBOOKLM_AUTH_REQUIRED', 'NOTEBOOKLM_CONFIG_INVALID', 'IMPORT_INVALID_SELECTION', 'IMPORT_NO_SELECTED_SOURCES']) {
  test(`friendly import failure ${code}, no added sources or automatic retry`, async t => {
    const ui = mount(t, { createError: new ClientError(code, secret) });
    await selectRun(ui);
    await confirm(ui);
    await ui.key(keys.enter);
    await ui.screen(code);
    assert.doesNotMatch(ui.frame(), /secret|stderr|cookie|credential|traceback/);
    assert.equal(ui.calls.execute.length, 1);
    assert.equal(ui.calls.create.length, 1);
    assert.deepEqual(ui.calls.add, []);
    await ui.key(keys.enter);
    assert.equal(ui.calls.execute.length, 1);
    await ui.key(keys.esc);
    await ui.screen('QueryTube Search Runs');
  });
}

test('dependency initialization and unknown errors are safely presented', async t => {
  for (const error of [new ClientError('QUERYTUBE_CONFIG_INVALID', secret), new Error(secret)]) {
    const ui = mount(t, { configError: error });
    await ui.screen(error instanceof ClientError ? error.code : 'INTERNAL_ERROR');
    assert.doesNotMatch(ui.frame(), /secret|credential|traceback/);
    assert.deepEqual(ui.calls.list, []);
  }
});

test('back during pending detail ignores late completion', async t => {
  let resolve;
  const ui = mount(t, { pendingDetail: new Promise(done => { resolve = done; }) });
  await ui.screen('QueryTube Search Runs');
  await ui.key(keys.enter);
  await ui.screen('Loading videos');
  await ui.key(keys.esc);
  await ui.screen('QueryTube Search Runs');
  resolve({ ...runs[0], videos });
  await delay(40);
  assert.match(ui.frame(), /QueryTube Search Runs/);
  assert.deepEqual(ui.calls.execute, []);
});

test('long lists keep keyboard focus visible', async t => {
  const ui = mount(t, { videos: Array.from({ length: 30 }, (_, index) => ({ ...videos[0], videoId: String(index), title: `Long video ${index}` })) });
  await selectRun(ui);
  for (let index = 0; index < 29; index++) await ui.key(keys.down);
  assert.match(ui.frame(), /> \[x\] Long video 29/);
  assert.match(ui.frame(), /30 \/ 30/);
  assert.doesNotMatch(ui.frame(), /Long video 0\n/);
});

test('TUI has no infrastructure/CLI DTO or subprocess dependencies', () => {
  for (const name of readdirSync('src/tui', { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(join('src/tui', name), 'utf8');
    assert.doesNotMatch(source, /(?:from|import\s*\()\s*['"][^'"]*(?:infrastructure|child_process|\/cli\/)/);
    assert.doesNotMatch(source, /QueryTube\w*Dto|generateImportId|createImportContext|fetch\s*\(/);
  }
});

test('compiled TUI command help is config free and validates arguments / terminal', () => {
  const run = args => spawnSync(process.execPath, ['dist/cli/index.js', ...args], {
    encoding: 'utf8', env: { ...process.env, QUERYTUBE_BASE_URL: '', NOTEBOOKLM_TIMEOUT_MS: 'invalid' },
  });
  for (const args of [['--help'], ['tui', '--help']]) {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /nlyt tui --user/);
    assert.equal(result.stderr, '');
  }
  for (const args of [['tui'], ['tui', '--user', ''], ['tui', 'extra', '--user', userId],
    ['tui', '--user', userId, '--title', 'Research'], ['tui', '--user', userId, '--video', 'a'],
    ['tui', '--user', userId, '--json'], ['tui', '--user', userId]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /stack|credential/);
  }
  assert.match(run(['tui', '--user', userId]).stderr, /interactive terminal/);
});


test('compiled nlyt tui smoke uses mocked HTTP and a fake backend, writing only after confirmation', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'nlyt-tui-'));
  const executable = join(cwd, 'fake-backend.mjs');
  const storage = join(cwd, 'fake-storage.json');
  const log = join(cwd, 'calls.jsonl');
  writeFileSync(storage, '{}');
  writeFileSync(executable, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.NLYT_TEST_LOG, JSON.stringify(args) + '\\n');
console.error('secret cookie traceback /credential/path');
console.log(JSON.stringify(args[5] === 'create'
  ? { notebook: { id: 'nb-1', title: args.at(-1) } } : { source: { id: 'src-1' } }));
`, { mode: 0o700 });
  const child = spawn(process.execPath, ['--import',
    fileURLToPath(new URL('./helpers/tui-fetch.mjs', import.meta.url)),
    fileURLToPath(new URL('../dist/cli/index.js', import.meta.url)), 'tui', '--user', userId], {
    cwd, env: { ...process.env, QUERYTUBE_BASE_URL: 'https://querytube.test',
      NOTEBOOKLM_CLI_PATH: executable, NOTEBOOKLM_STORAGE_PATH: storage,
      NOTEBOOKLM_TIMEOUT_MS: '2000', NLYT_TEST_LOG: log },
  });
  t.after(() => { child.kill(); rmSync(cwd, { recursive: true, force: true }); });
  let output = '';
  let errors = '';
  let exitCode;
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  child.on('close', code => { exitCode = code; });
  const screen = async text => waitFor(() => output.includes(text), `compiled TUI ${text}: ${output} ${errors}`);
  const press = async value => { child.stdin.write(value); await delay(40); };
  await screen('QueryTube Search Runs');
  await press(keys.enter);
  await screen('Videos — run-1');
  await press('n');
  await press(' ');
  await press(keys.enter);
  await screen('Notebook title');
  await press('Research');
  await press(keys.enter);
  await screen('Ready to import');
  assert.equal(existsSync(log), false, 'no backend readiness probes or writes before confirmation');
  await press(keys.enter);
  await screen('Import complete');
  await press('q');
  await waitFor(() => exitCode !== undefined, 'compiled TUI q exit');
  assert.equal(exitCode, 0);
  assert.doesNotMatch(output + errors, /secret|cookie|traceback|credential/);
  assert.equal(stripVTControlCharacters(errors), '', 'only terminal cursor restoration may be written to stderr');
  assert.match(output, /skipped: 2/);
  const commands = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(commands.length, 2, 'one create and one add, no list/delete/retry');
  assert.match(commands[0].at(-1), /^Research \[\d{2}-\d{4}\] \[NLYT-[A-Z0-9]{6}\]$/);
  assert.equal(commands[1].at(-1), 'https://www.youtube.com/watch?v=a');
});


test('long failure report retains counts and scrolls to every failed video', async t => {
  const ui = mount(t, { failAll: true, videos: Array.from({ length: 30 }, (_, index) => ({
    ...videos[0], videoId: `failed-${index}`, title: `Video ${index}`, url: `https://youtube.test/${index}`,
  })) });
  await selectRun(ui);
  await confirm(ui);
  await ui.key(keys.enter);
  await ui.screen('Import complete — failure');
  for (let index = 0; index < 29; index++) await ui.key(keys.down);
  await ui.screen('> failed-29 — NOTEBOOKLM_BACKEND_ERROR');
  assert.match(ui.frame(), /> failed-29 — NOTEBOOKLM_BACKEND_ERROR/);
  assert.match(ui.frame(), /failed: 30/);
  assert.match(ui.frame(), /Import complete — failure/);
  assert.match(ui.frame(), /30 \/ 30/);
});

test('detail failure returns to the list; terminal controls in domain labels are inert', async t => {
  const ui = mount(t, { detailError: new ClientError('QUERYTUBE_NOT_FOUND', secret) });
  await ui.screen('QueryTube Search Runs');
  await ui.key(keys.enter);
  await ui.screen('QUERYTUBE_NOT_FOUND');
  assert.doesNotMatch(ui.frame(), /secret|credential|traceback/);
  await ui.key(keys.esc);
  await ui.screen('QueryTube Search Runs');
  const labels = mount(t, { videos: [{ ...videos[0], title: '\u001b[31mRed\u001b[0m\n\u0007title' }] });
  await selectRun(labels);
  assert.match(labels.frame(), /Redtitle/);
  assert.doesNotMatch(labels.frame(), /\[31m|\[0m/);
});

test('date formatting uses an explicit zone deterministically and handles invalid strings', () => {
  assert.equal(formatStartedAt('2026-10-04T09:32:00Z', 'Asia/Taipei'), '10/04 17:32');
  assert.equal(formatStartedAt('2026-10-04T09:32:00Z', 'UTC'), '10/04 09:32');
  assert.equal(formatStartedAt('2026-10-04T16:00:00Z', 'Asia/Taipei'), '10/05 00:00');
  assert.equal(formatStartedAt('invalid', 'UTC'), 'Unknown date');
});

test('status semantics stay in presentation without ANSI snapshots', () => {
  assert.deepEqual(['completed', 'partial', 'failed', 'running'].map(status => searchRunStatus(status).color),
    ['green', 'yellow', 'red', 'cyan']);
});

test('richer rows retain identity even with duplicate names and use fallback for absent names', async t => {
  const metadata = { ...summaryDto, startedAt: '2026-10-04T09:32:00Z', totalResults: 126, queryCount: 18 };
  const ui = mount(t, { runs: [
    internalSummary(userId, { ...metadata, id: 'first', querySetName: 'Same name' }),
    internalSummary(userId, { ...metadata, id: 'second', querySetName: 'Same name', status: 'partial' }),
    internalSummary(userId, { ...metadata, id: 'third', querySetName: null }),
  ] });
  await ui.screen('QueryTube Search Runs');
  assert.match(ui.frame(), new RegExp(formatStartedAt(metadata.startedAt)));
  assert.match(ui.frame(), /Same name/);
  assert.match(ui.frame(), /126 results · 18 queries/);
  assert.match(ui.frame(), /✓ completed/);
  assert.match(ui.frame(), /! partial/);
  assert.match(ui.frame(), /Unnamed Search Run/);
  assert.doesNotMatch(ui.frame(), /null|undefined/);
  await ui.key(keys.down);
  await ui.key(keys.enter);
  await ui.screen('Videos — second');
  assert.deepEqual(ui.calls.get, [[userId, 'second']]);
});

test('long Search Run lists keep the focused row visible', async t => {
  const ui = mount(t, { runs: Array.from({ length: 30 }, (_, i) =>
    internalSummary(userId, { ...summaryDto, id: `run-${i}`, querySetName: `Set ${i}` })) });
  await ui.screen('QueryTube Search Runs');
  for (let i = 0; i < 29; i++) await ui.key(keys.down);
  await ui.screen('30 / 30');
  assert.match(ui.frame(), /> .*Set 29/);
  assert.match(ui.frame(), /run-29/);
  assert.match(ui.frame(), /30 \/ 30/);
  await ui.key(keys.enter);
  await ui.screen('Videos — run-29');
  assert.deepEqual(ui.calls.get, [[userId, 'run-29']]);
});

test('narrow Search Run rows truncate long names and keep the selection and ID visible', async t => {
  const app = render(createElement(SearchRunList, { runs: [internalSummary(userId, {
    ...summaryDto, querySetName: '\u001b[31m' + '很長的名稱'.repeat(50) + '\u001b[0m',
  })], index: 0 }));
  t.after(() => { app.unmount(); app.cleanup(); });
  Object.defineProperty(app.stdout, 'columns', { value: 40 });
  app.stdout.emit('resize');
  app.rerender(createElement(SearchRunList, { runs: [internalSummary(userId, {
    ...summaryDto, querySetName: '\u001b[31m' + '很長的名稱'.repeat(50) + '\u001b[0m',
  })], index: 0 }));
  await delay(50);
  const frame = app.lastFrame();
  assert.match(frame, /> /);
  assert.match(frame, /run-1/);
  assert.doesNotMatch(frame, /\[31m|\[0m/);
  assert.equal(frame.split('\n').length, 3);
  assert.ok(frame.split('\n').every(line => Array.from(line).length <= 40));
});

function successfulResult(sources = videos) {
  return { importId: 'NLYT-A83K2F', createdAt: '2026-10-04T08:09:31.123Z',
    notebook: { id: 'nb-1', title: 'Research' }, sources: sources.map(source => ({
      source, status: 'success', notebookSource: { id: `src-${source.videoId}`, url: source.url },
    })) };
}

test('selected creation, live source progress and keyboard safety preserve authoritative report', async t => {
  let resolve;
  let emit;
  const sources = Array.from({ length: 9 }, (_, index) => ({ ...videos[0], videoId: String(index) }));
  const ui = mount(t, { videos: sources, pendingImport: new Promise(done => { resolve = done; }),
    captureProgress: callback => { emit = callback; } });
  await selectRun(ui);
  await ui.key(' ');
  await confirm(ui);
  ui.app.stdin.write(keys.enter);
  ui.app.stdin.write(keys.enter);
  await ui.screen('Creating Notebook...');
  assert.match(ui.frame(), /Selected sources: 8/);
  assert.doesNotMatch(ui.frame(), /\d+%/);
  emit({ phase: 'creating_notebook', total: 8 });
  emit({ phase: 'importing_sources', completed: 0, total: 8, succeeded: 0, failed: 0 });
  await ui.screen('0 / 8');
  assert.match(ui.frame(), /\[--------------------\] 0 \/ 8 {2}0%/);
  emit({ phase: 'importing_sources', completed: 3, total: 8, succeeded: 2, failed: 1 });
  await ui.screen('3 / 8');
  assert.match(ui.frame(), /\[#######-------------\] 3 \/ 8 {2}38%/);
  assert.match(ui.frame(), /Succeeded 2/);
  assert.match(ui.frame(), /Failed 1/);
  const listeners = ui.app.stdin.listenerCount('readable');
  for (const key of ['q', keys.esc, keys.enter, keys.down, keys.up, ' ', 'a', 'n']) {
    await ui.key(key);
    assert.match(ui.frame(), /3 \/ 8/);
    assert.equal(ui.calls.execute.length, 1);
    assert.equal(ui.app.stdin.listenerCount('readable'), listeners);
  }
  emit({ phase: 'importing_sources', completed: 8, total: 8, succeeded: 7, failed: 1 });
  await ui.screen('8 / 8');
  assert.match(ui.frame(), /\[####################\] 8 \/ 8 {2}100%/);
  // Deliberately different from the observation: only the returned result drives the report.
  resolve(successfulResult());
  await ui.screen('Import complete — success');
  assert.match(ui.frame(), /succeeded: 3/);
  assert.match(ui.frame(), /failed: 0/);
  emit({ phase: 'importing_sources', completed: 0, total: 8, succeeded: 0, failed: 0 });
  await delay(40);
  assert.match(ui.frame(), /Import complete — success/);
});

test('asynchronous progress events render each newest state and are ignored after unmount', async t => {
  let resolve;
  let emit;
  const ui = mount(t, { pendingImport: new Promise(done => { resolve = done; }),
    captureProgress: callback => { emit = callback; } });
  await selectRun(ui);
  await confirm(ui);
  await ui.key(keys.enter);
  for (let completed = 1; completed <= 3; completed++) {
    await delay(10);
    emit({ phase: 'importing_sources', completed, total: 3, succeeded: completed, failed: 0 });
    await ui.screen(`${completed} / 3`);
    assert.match(ui.frame(), new RegExp(`${Math.round(completed / 3 * 100)}%`));
  }
  ui.app.unmount();
  const frames = ui.app.frames.length;
  emit({ phase: 'importing_sources', completed: 0, total: 3, succeeded: 0, failed: 0 });
  resolve(successfulResult());
  await delay(40);
  assert.equal(ui.app.frames.length, frames);
});

test('partial source failure progress stays importing until a fatal rejection', async t => {
  let reject;
  let emit;
  const ui = mount(t, { pendingImport: new Promise((resolve, fail) => { reject = fail; }),
    captureProgress: callback => { emit = callback; } });
  await selectRun(ui);
  await confirm(ui);
  await ui.key(keys.enter);
  emit({ phase: 'importing_sources', completed: 2, total: 3, succeeded: 1, failed: 1 });
  await ui.screen('2 / 3');
  assert.match(ui.frame(), /Importing sources/);
  assert.match(ui.frame(), /Failed 1/);
  reject(new ClientError('NOTEBOOKLM_TIMEOUT', secret));
  await ui.screen('NOTEBOOKLM_TIMEOUT');
  assert.doesNotMatch(ui.frame(), /secret|credential|traceback/);
  emit({ phase: 'importing_sources', completed: 3, total: 3, succeeded: 2, failed: 1 });
  await delay(40);
  assert.match(ui.frame(), /NOTEBOOKLM_TIMEOUT/);
});

test('progress formatter rounds percentages, floors cells and clamps invalid presentation values', () => {
  for (const [completed, total, expectedCompleted, expectedTotal, percentage, cells] of [
    [0, 8, 0, 8, 0, 0], [3, 8, 3, 8, 38, 7], [5, 8, 5, 8, 63, 12],
    [8, 8, 8, 8, 100, 20], [1, 3, 1, 3, 33, 6], [2, 3, 2, 3, 67, 13],
    [1, 0, 0, 0, 0, 0], [-1, 8, 0, 8, 0, 0], [9, 8, 8, 8, 100, 20],
    [NaN, 8, 0, 8, 0, 0], [1, Infinity, 0, 0, 0, 0],
  ]) {
    assert.deepEqual(formatProgress(completed, total), { completed: expectedCompleted, total: expectedTotal,
      percentage, filled: '#'.repeat(cells), remaining: '-'.repeat(20 - cells) });
  }
});
