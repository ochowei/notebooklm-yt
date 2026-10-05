import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSearchRunFile, normalizeSearchRunFile } from '../dist/infrastructure/search-run-file/adapter.js';
import { ImportSearchRunToNotebook, summarizeImportSources } from '../dist/application/import-search-run-to-notebook.js';
import { ClientError } from '../dist/application/errors.js';
import { parseSearchRun } from '../dist/infrastructure/querytube/contract.js';
import { toImportSource } from '../dist/infrastructure/querytube/mapper.js';
import { parse } from 'yaml';

const path = name => fileURLToPath(new URL(`./fixtures/search-run-${name}.yaml`, import.meta.url));
const expected = ['abc', 'shared', 'xyz'].map((videoId, index) => ({
  videoId, title: ['WoW Forever review', 'Shared review', 'WoW Forever thoughts'][index],
  url: `https://www.youtube.com/watch?v=${videoId}`,
}));
const externalVideo = video => ({ video_id: video.videoId, title: video.title, url: video.url });
const exportRun = (videos = expected) => ({
  generated_at: '2026-10-05T01:53:44.631Z',
  summary: { queries: 1, successful: 1, failed: 0, total_results: videos.length },
  results: [{ videos: videos.map(externalVideo) }],
});

test('real-shaped export accepts results and snake_case without top-level run/owner identity', async () => {
  const run = await loadSearchRunFile(path('valid'));
  assert.deepEqual(run, { videos: expected });
  assert.equal('searchRunId' in run, false);
  assert.equal('userId' in run, false);
  const payload = parse(await readFile(path('valid'), 'utf8'));
  assert.equal('id' in payload, false);
  assert.equal('userId' in payload, false);
  assert.equal(payload.results.length, 2);
  assert.equal(payload.results.flatMap(query => query.videos).length, 4);
  const before = structuredClone(payload);
  const apiPayload = {
    id: 'api-run', queryResults: payload.results.map(query => ({
      videos: query.videos.map(video => ({ videoId: video.video_id, title: video.title, url: video.url })),
    })),
  };
  assert.deepEqual(run.videos, toImportSource('owner', parseSearchRun(apiPayload)).videos);
  assert.deepEqual(payload, before);
  assert.deepEqual(run.videos.map(video => Object.keys(video).sort()), expected.map(() => ['title', 'url', 'videoId']));
});

test('dedupe tie-breaks and ordering remain identical to API mapping under input permutations', () => {
  const videos = [expected[2], { ...expected[0], title: '' },
    { ...expected[0], title: 'Z review' }, { ...expected[0], url: expected[0].url + '&z=1' },
    expected[0], expected[1], { ...expected[1], title: 'Z shared' }];
  for (const ordered of [videos, [...videos].reverse()]) {
    const payload = exportRun(ordered);
    const apiPayload = { id: 'api-run', queryResults: [{ videos: ordered }] };
    const before = structuredClone(payload);
    assert.deepEqual(normalizeSearchRunFile(payload).videos, expected);
    assert.deepEqual(normalizeSearchRunFile(payload).videos, toImportSource('owner', parseSearchRun(apiPayload)).videos);
    assert.deepEqual(payload, before);
  }
});

test('optional errors and unused metadata do not become domain fields or API identity', () => {
  for (const errors of [undefined, [], [{ id: 'failed-query', message: 'omitted upstream metadata' }]]) {
    const payload = { ...exportRun(), errors, id: 'not-an-api-run', userId: 'not-an-api-owner', unused: 'ignored metadata' };
    assert.deepEqual(normalizeSearchRunFile(payload), { videos: expected });
  }
});

for (const [name, code] of [
  ['missing', 'SEARCH_RUN_FILE_NOT_FOUND'], ['broken', 'SEARCH_RUN_YAML_INVALID'],
  ['invalid', 'SEARCH_RUN_SCHEMA_INVALID'], ['empty', 'SEARCH_RUN_EMPTY'],
]) {
  test(`${name} file has stable ${code} without parser/filesystem diagnostics`, async () => {
    await assert.rejects(loadSearchRunFile(path(name)), error => {
      assert.equal(error.code, code);
      assert.ok(error instanceof ClientError);
      assert.ok(!error.message.includes(path(name)));
      return true;
    });
  });
}

test('directory read failure is distinct from missing file', async () => {
  await assert.rejects(loadSearchRunFile(fileURLToPath(new URL('./fixtures/', import.meta.url))), { code: 'SEARCH_RUN_FILE_READ_ERROR' });
});

test('schema rejects malformed export envelopes and legacy API-shaped YAML', () => {
  for (const value of [null, [], 'run', {}, { id: 'run', queryResults: [] },
    ...[undefined, null, '', 123].map(generated_at => ({ ...exportRun(), generated_at })),
    ...[undefined, null, [], {}].map(summary => ({ ...exportRun(), summary })),
    ...[undefined, null, {}].map(results => ({ ...exportRun(), results })),
    ...[null, {}, 'error'].map(errors => ({ ...exportRun(), errors })),
    { ...exportRun(), results: [null] }, { ...exportRun(), results: [{}] },
    { ...exportRun(), results: [{ videos: null }] }, { ...exportRun(), results: [{ videos: [null] }] },
  ]) assert.throws(() => normalizeSearchRunFile(value), { code: 'SEARCH_RUN_SCHEMA_INVALID' });
  for (const field of ['queries', 'successful', 'failed', 'total_results']) {
    for (const count of [undefined, null, '1', -1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const payload = exportRun();
      payload.summary[field] = count;
      assert.throws(() => normalizeSearchRunFile(payload), { code: 'SEARCH_RUN_SCHEMA_INVALID' });
    }
  }
});

test('schema requires snake_case consumed video fields and accepts empty titles', () => {
  for (const fields of [{ video_id: undefined }, { video_id: '' }, { video_id: ' ' }, { video_id: 12 },
    { video_id: 'bad\0id' }, { url: '' }, { url: ' ' }, { url: null }, { url: 'bad\0url' }, { title: null }]) {
    const payload = exportRun([expected[0]]);
    Object.assign(payload.results[0].videos[0], fields);
    assert.throws(() => normalizeSearchRunFile(payload), { code: 'SEARCH_RUN_SCHEMA_INVALID' });
  }
  const camelCase = { ...exportRun(), results: [{ videos: expected }] };
  assert.throws(() => normalizeSearchRunFile(camelCase), { code: 'SEARCH_RUN_SCHEMA_INVALID' });
  assert.equal(normalizeSearchRunFile(exportRun([{ ...expected[0], title: '' }])).videos[0].title, '');
});

test('zero videos in results or zero result groups is an empty Search Run', () => {
  for (const payload of [exportRun([]), { ...exportRun([]), results: [] }]) {
    assert.throws(() => normalizeSearchRunFile(payload), { code: 'SEARCH_RUN_EMPTY' });
  }
});

test('duplicate keys, multiple documents, unknown tags and alias expansion are safe YAML errors', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'nlyt-yaml-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const text of ['id: one\nid: two', 'id: one\n---\nid: two', 'id: !custom run',
    'a: &a [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
  ]) {
    const file = join(cwd, 'run.yaml');
    await writeFile(file, text);
    await assert.rejects(loadSearchRunFile(file), { code: 'SEARCH_RUN_YAML_INVALID' });
  }
  await writeFile(join(cwd, 'run.yaml'), '');
  await assert.rejects(loadSearchRunFile(join(cwd, 'run.yaml')), { code: 'SEARCH_RUN_SCHEMA_INVALID' });
});

for (const mode of ['success', 'partial', 'all']) {
  test(`YAML uses shared workflow for selection and ${mode} source results`, async () => {
    const run = await loadSearchRunFile(path('valid'));
    const calls = [];
    const importer = new ImportSearchRunToNotebook(undefined, {
      createNotebook: async title => { calls.push(['create', title]); return { id: 'nb', title }; },
      addYouTubeSource: async (id, url) => {
        calls.push(['add', id, url]);
        if (mode === 'all' || (mode === 'partial' && url.endsWith('=shared'))) {
          throw new ClientError('NOTEBOOKLM_BACKEND_ERROR', 'unpublished backend detail');
        }
        return { id: 'src', url };
      },
    }, { clock: () => new Date('2026-10-05T00:00:00Z'), generateId: () => 'NLYT-ABC123' });
    const before = structuredClone(run);
    const result = await importer.executeRun({ notebookTitle: 'Research', selection: { videoIds: ['shared', 'abc', 'shared'] } }, run);
    assert.deepEqual(calls.slice(1), expected.slice(0, 2).map(video => ['add', 'nb', video.url]));
    assert.equal(calls.length, 3);
    assert.deepEqual(result.sources.map(source => source.status),
      mode === 'success' ? ['success', 'success', 'skipped'] : mode === 'partial' ? ['success', 'failure', 'skipped'] : ['failure', 'failure', 'skipped']);
    assert.equal(summarizeImportSources(result.sources).status,
      mode === 'success' ? 'success' : mode === 'partial' ? 'partial_failure' : 'failure');
    assert.equal(result.importId, 'NLYT-ABC123');
    assert.ok(result.notebook.title.endsWith('[NLYT-ABC123]'));
    assert.deepEqual(run, before);
    assert.doesNotMatch(JSON.stringify(result), /unpublished/);
  });
}

test('normalized entry retains validation and fatal create context before any adds', async () => {
  const run = await loadSearchRunFile(path('valid'));
  let creates = 0;
  const importer = new ImportSearchRunToNotebook(undefined, {
    createNotebook: async () => { creates++; throw new ClientError('NOTEBOOKLM_TIMEOUT', 'detail'); },
    addYouTubeSource: async () => assert.fail('must not add'),
  });
  await assert.rejects(importer.executeRun({ notebookTitle: '' }, run), { code: 'IMPORT_INVALID_ARGUMENTS' });
  await assert.rejects(importer.executeRun({ notebookTitle: 'test', selection: { videoIds: [] } }, run), { code: 'IMPORT_NO_SELECTED_SOURCES' });
  await assert.rejects(importer.executeRun({ notebookTitle: 'test', selection: { videoIds: ['unknown'] } }, run), { code: 'IMPORT_INVALID_SELECTION' });
  assert.equal(creates, 0);
  await assert.rejects(importer.executeRun({ notebookTitle: 'test' }, run), error => {
    assert.equal(error.code, 'NOTEBOOKLM_TIMEOUT');
    assert.match(error.context.importId, /^NLYT-[A-Z0-9]{6}$/);
    assert.ok(error.context.notebookTitle.startsWith('test ['));
    return true;
  });
  assert.equal(creates, 1);
});
