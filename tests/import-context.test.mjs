import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createImportContext, generateImportId } from '../dist/application/import-context.js';
import { ImportSearchRunToNotebook } from '../dist/application/import-search-run-to-notebook.js';
import { importReport, importHumanOutput, importExitCode } from '../dist/cli/import-output.js';

const createdAt = '2026-10-04T08:09:31.123Z';
const input = { userId: 'user-1', searchRunId: 'run-1', notebookTitle: 'WoW 永恆' };

for (const [timezone, display] of [
  ['Asia/Taipei', '04-1609'], ['UTC', '04-0809'], ['America/Los_Angeles', '04-0109'],
  ['Pacific/Honolulu', '03-2209'],
]) {
  test(`title uses local timezone ${timezone}, createdAt retains full UTC timestamp`, () => {
    const module = new URL('../dist/application/import-context.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { createImportContext } from ${JSON.stringify(module)};
      console.log(JSON.stringify(createImportContext('WoW 永恆', {
        clock: () => new Date('${createdAt}'), generateId: () => 'NLYT-A83K2F',
      })));
    `], { encoding: 'utf8', env: { ...process.env, TZ: timezone } });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      importId: 'NLYT-A83K2F', createdAt, notebookTitle: `WoW 永恆 [${display}] [NLYT-A83K2F]`,
    });
  });
}

test('production cryptographic IDs follow the six uppercase alphanumeric contract', () => {
  const ids = Array.from({ length: 32 }, generateImportId);
  for (const id of ids) assert.match(id, /^NLYT-[A-Z0-9]{6}$/);
  assert.ok(new Set(ids).size > 1);
});

test('repeated imports of the same run generate one fresh context per invocation', async () => {
  let clocks = 0;
  let ids = 0;
  const titles = [];
  const workflow = new ImportSearchRunToNotebook({ getSearchRun: async () => ({
    ...input, videos: [{ videoId: 'a', title: 'A', url: 'https://www.youtube.com/watch?v=a' }],
  }) }, {
    createNotebook: async title => { titles.push(title); return { id: 'backend-id', title }; },
    addYouTubeSource: async () => ({ id: 'source-id', url: 'https://www.youtube.com/watch?v=a' }),
  }, {
    clock: () => { clocks++; return new Date(createdAt); },
    generateId: () => ['NLYT-A83K2F', 'NLYT-B94L3G'][ids++],
  });
  const first = await workflow.execute(input);
  const second = await workflow.execute(input);
  assert.notEqual(first.importId, second.importId);
  assert.equal(clocks, 2);
  assert.equal(ids, 2);
  for (const [index, result] of [first, second].entries()) {
    assert.equal(result.createdAt, createdAt);
    assert.equal(result.notebook.id, 'backend-id');
    assert.equal(titles[index], result.notebook.title);
    assert.ok(titles[index].endsWith(`[${result.importId}]`));
  }
});

test('fatal unknown create errors retain the single context and safe failure output', async () => {
  let ids = 0;
  let clocks = 0;
  let requestedTitle;
  const workflow = new ImportSearchRunToNotebook({ getSearchRun: async () => ({
    videos: [{ videoId: 'a', title: 'A', url: 'https://www.youtube.com/watch?v=a' }],
  }) }, {
    createNotebook: async title => { requestedTitle = title; throw new Error('secret backend detail'); },
    addYouTubeSource: async () => assert.fail('must not add'),
  }, {
    clock: () => { clocks++; return new Date(createdAt); },
    generateId: () => { ids++; return 'NLYT-A83K2F'; },
  });
  await assert.rejects(workflow.execute(input), error => {
    const report = importReport(input, undefined, error);
    assert.equal(report.importId, 'NLYT-A83K2F');
    assert.equal(report.createdAt, createdAt);
    assert.equal(report.notebook.title, requestedTitle);
    assert.equal(report.notebook.created, false);
    assert.deepEqual(report.errors, [{ code: 'INTERNAL_ERROR' }]);
    assert.equal(importExitCode(report), 1);
    assert.match(importHumanOutput(report), /Import\n- id: NLYT-A83K2F\n- created: 2026-10-04T08:09:31.123Z/);
    assert.doesNotMatch(JSON.stringify(report), /secret backend/);
    return true;
  });
  assert.equal(ids, 1);
  assert.equal(clocks, 1);
});

test('context captures the clock once and retains user whitespace', () => {
  let calls = 0;
  const context = createImportContext('  title  ', {
    clock: () => { calls++; return new Date(createdAt); }, generateId: () => 'NLYT-A83K2F',
  });
  assert.equal(calls, 1);
  assert.ok(context.notebookTitle.startsWith('  title   ['));
  assert.equal(new Date(context.createdAt).toISOString(), context.createdAt);
});
