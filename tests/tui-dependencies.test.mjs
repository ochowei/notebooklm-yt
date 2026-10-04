import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTuiDependencies } from '../dist/cli/tui-dependencies.js';
import { ImportSearchRunToNotebook } from '../dist/application/import-search-run-to-notebook.js';
import { NotebookLmCliProvider } from '../dist/infrastructure/notebooklm/notebook-lm-cli-provider.js';

test('production TUI composition preserves onProgress through the real importer', async () => {
  const videos = ['a', 'b', 'c'].map(videoId => ({
    videoId, title: videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
  }));
  const queryTube = {
    listSearchRuns: async () => [],
    getSearchRun: async (userId, searchRunId) => {
      assert.equal(userId, 'user-1');
      assert.equal(searchRunId, 'run-1');
      return { userId, searchRunId, videos };
    },
  };
  const commands = [];
  let providerCreations = 0;
  const dependencies = createTuiDependencies(queryTube, () => {
    providerCreations++;
    return new NotebookLmCliProvider({ run: async args => {
      commands.push(args);
      return args[0] === 'create'
        ? { notebook: { id: 'nb-1', title: args.at(-1) } }
        : { source: { id: `src-${commands.length - 1}` } };
    } });
  });
  assert.equal(dependencies.queryTube, queryTube);
  await dependencies.queryTube.listSearchRuns('user-1');
  assert.equal(providerCreations, 0, 'browsing must not initialize NotebookLM');
  assert.ok(dependencies.importer instanceof ImportSearchRunToNotebook);
  assert.equal(dependencies.importer, dependencies.importer);
  assert.equal(providerCreations, 1);

  const events = [];
  const result = await dependencies.importer.execute({
    userId: 'user-1', searchRunId: 'run-1', notebookTitle: 'Progress smoke',
    selection: { videoIds: ['a', 'c'] },
  }, { onProgress: event => events.push(event) });

  assert.deepEqual(events, [
    { phase: 'creating_notebook', total: 2 },
    { phase: 'importing_sources', completed: 0, total: 2, succeeded: 0, failed: 0 },
    { phase: 'importing_sources', completed: 1, total: 2, succeeded: 1, failed: 0 },
    { phase: 'importing_sources', completed: 2, total: 2, succeeded: 2, failed: 0 },
  ]);
  assert.deepEqual(result.sources.map(source => source.status), ['success', 'skipped', 'success']);
  assert.deepEqual(commands, [
    ['create', '--json', '--', result.notebook.title],
    ...[videos[0], videos[2]].map(video => [
      'source', 'add', '--notebook', 'nb-1', '--type', 'youtube', '--json', '--', video.url,
    ]),
  ]);
});
