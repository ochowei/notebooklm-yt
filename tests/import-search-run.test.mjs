import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImportSearchRunToNotebook } from '../dist/application/import-search-run-to-notebook.js';
import { ClientError } from '../dist/application/errors.js';
import { QueryTubeHttpClient } from '../dist/infrastructure/querytube/client.js';
import { NotebookLmCliProvider } from '../dist/infrastructure/notebooklm/notebook-lm-cli-provider.js';
import { detail } from './helpers/fixtures.mjs';

const input = { userId: 'user-1', searchRunId: 'run-1', notebookTitle: 'Research' };
const metadata = { importId: 'NLYT-A83K2F', createdAt: '2026-10-04T08:09:31.123Z' };
const dependencies = { clock: () => new Date(metadata.createdAt), generateId: () => metadata.importId };
const date = dependencies.clock();
const pad = value => String(value).padStart(2, '0');
const suffix = ` [${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}] [${metadata.importId}]`;
const notebook = { id: 'nb-1', title: input.notebookTitle + suffix };
const videos = ['a', 'b', 'c'].map(videoId => ({
  videoId, title: videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
}));
const notebookSource = source => ({ id: `src-${source.videoId}`, url: source.url });
const success = source => ({ source, status: 'success', notebookSource: notebookSource(source) });
const failure = (source, code) => ({ source, status: 'failure', error: { code } });

function fixture({ sources = videos, fetchError, createError, addErrors = [] } = {}) {
  const calls = [];
  let active = false;
  const useCase = new ImportSearchRunToNotebook({
    listSearchRuns: async () => assert.fail('must not list'),
    getSearchRun: async (userId, searchRunId) => {
      calls.push(['get', userId, searchRunId]);
      if (fetchError) throw fetchError;
      return { userId, searchRunId, videos: sources };
    },
  }, {
    createNotebook: async title => {
      calls.push(['create', title]);
      if (createError) throw createError;
      return notebook;
    },
    addYouTubeSource: async (id, url) => {
      assert.equal(active, false, 'adds must not overlap');
      active = true;
      calls.push(['add', id, url]);
      await new Promise(resolve => setImmediate(resolve));
      active = false;
      const index = calls.filter(call => call[0] === 'add').length - 1;
      if (index in addErrors) throw addErrors[index];
      return notebookSource(sources[index]);
    },
    deleteNotebook: async () => assert.fail('must not delete'),
  }, dependencies);
  return { useCase, calls };
}

const expectedCalls = sources => [
  ['get', input.userId, input.searchRunId], ['create', notebook.title],
  ...sources.map(source => ['add', notebook.id, source.url]),
];

test('happy path fetches and creates once, importing A/B/C sequentially', async () => {
  const { useCase, calls } = fixture();
  assert.deepEqual(await useCase.execute(input), { ...metadata, notebook, sources: videos.map(success) });
  assert.deepEqual(calls, expectedCalls(videos));
});

test('empty run fails before creating any NotebookLM resource', async () => {
  const { useCase, calls } = fixture({ sources: [] });
  await assert.rejects(useCase.execute(input), { code: 'IMPORT_NO_SOURCES' });
  assert.deepEqual(calls, [['get', input.userId, input.searchRunId]]);
});

test('Search Run fetch failure preserves the error and never calls NotebookProvider', async () => {
  const error = new ClientError('QUERYTUBE_NOT_FOUND', 'Not found');
  const { useCase, calls } = fixture({ fetchError: error });
  await assert.rejects(useCase.execute(input), actual => actual.cause === error && actual.context.importId === metadata.importId
    && actual.context.createdAt === metadata.createdAt && actual.context.notebookTitle === notebook.title);
  assert.deepEqual(calls, [['get', input.userId, input.searchRunId]]);
});

test('create failure preserves the error, adds nothing and does not retry', async () => {
  const error = new ClientError('NOTEBOOKLM_TIMEOUT', 'Unconfirmed create');
  const { useCase, calls } = fixture({ createError: error });
  await assert.rejects(useCase.execute(input), actual => actual.cause === error && actual.context.importId === metadata.importId
    && actual.context.createdAt === metadata.createdAt && actual.context.notebookTitle === notebook.title);
  assert.deepEqual(calls, expectedCalls([]));
});

test('partial failure retains A and C successes and only B stable code without retry', async () => {
  const addErrors = [];
  addErrors[1] = new ClientError('NOTEBOOKLM_BACKEND_ERROR', 'secret traceback');
  const { useCase, calls } = fixture({ addErrors });
  const result = await useCase.execute(input);
  assert.deepEqual(result, { ...metadata, notebook, sources: [
    success(videos[0]), failure(videos[1], 'NOTEBOOKLM_BACKEND_ERROR'), success(videos[2]),
  ] });
  assert.doesNotMatch(JSON.stringify(result), /secret|traceback|stack/);
  assert.deepEqual(calls, expectedCalls(videos));
});

test('all sources failing still returns notebook, with safe unknown errors and no rollback', async () => {
  for (const unknown of [new Error('secret traceback'), { code: 'RAW_BACKEND', stderr: 'secret' }, null]) {
    const { useCase, calls } = fixture({ sources: videos.slice(0, 2), addErrors: [
      new ClientError('NOTEBOOKLM_AUTH_REQUIRED', 'secret cookie'), unknown,
    ] });
    const result = await useCase.execute(input);
    assert.deepEqual(result, { ...metadata, notebook, sources: [
      failure(videos[0], 'NOTEBOOKLM_AUTH_REQUIRED'), failure(videos[1], 'INTERNAL_ERROR'),
    ] });
    assert.deepEqual(calls, expectedCalls(videos.slice(0, 2)));
  }
});

test('use case preserves port order and duplicates without selection or mutation', async () => {
  const sources = [videos[2], videos[0], videos[2], videos[1]];
  const before = structuredClone(sources);
  const { useCase, calls } = fixture({ sources });
  assert.deepEqual(await useCase.execute(input), { ...metadata, notebook, sources: sources.map(success) });
  assert.deepEqual(calls, expectedCalls(sources));
  assert.deepEqual(sources, before);
});

test('invalid inputs reject before fetch, including title validation at the application boundary', async () => {
  for (const field of ['userId', 'searchRunId', 'notebookTitle']) {
    for (const value of ['', ' \t\n', 'bad\0value', null, 123, undefined]) {
      const { useCase, calls } = fixture();
      await assert.rejects(useCase.execute({ ...input, [field]: value }), { code: 'IMPORT_INVALID_ARGUMENTS' });
      assert.deepEqual(calls, []);
    }
  }
  for (const field of ['userId', 'searchRunId']) {
    for (const value of ['.', '..']) {
      const { useCase, calls } = fixture();
      await assert.rejects(useCase.execute({ ...input, [field]: value }), { code: 'IMPORT_INVALID_ARGUMENTS' });
      assert.deepEqual(calls, []);
    }
  }
});

test('user title is preserved verbatim before the centralized identification suffix', async () => {
  const { useCase, calls } = fixture();
  const notebookTitle = '  --中文 research  ';
  await useCase.execute({ ...input, notebookTitle });
  assert.deepEqual(calls[1], ['create', notebookTitle + suffix]);
});

test('actual adapters compose with mocked transport/runner and preserve existing mapper semantics', async () => {
  let fetches = 0;
  const queryTube = new QueryTubeHttpClient('https://querytube.test', async () => {
    fetches++;
    return Response.json(detail([videos[2], videos[0], videos[1], videos[0]]));
  });
  const commands = [];
  const provider = new NotebookLmCliProvider({ run: async args => {
    commands.push(args);
    return args[0] === 'create' ? { notebook } : { source: { id: `src-${args.at(-1).slice(-1)}` } };
  } });
  const result = await new ImportSearchRunToNotebook(queryTube, provider, dependencies).execute(input);
  assert.equal(fetches, 1);
  assert.deepEqual(result, { ...metadata, notebook, sources: videos.map(success) });
  assert.deepEqual(commands, [
    ['create', '--json', '--', notebook.title],
    ...videos.map(source => ['source', 'add', '--notebook', notebook.id, '--type', 'youtube', '--json', '--', source.url]),
  ]);
});
