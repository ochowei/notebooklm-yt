import { ImportSearchRunToNotebook } from '../application/import-search-run-to-notebook.js';
import type { NotebookProvider } from '../application/notebook-provider.js';
import type { QueryTubeClient } from '../application/querytube-client.js';
import { NotebookLmCliProvider } from '../infrastructure/notebooklm/notebook-lm-cli-provider.js';
import { QueryTubeHttpClient } from '../infrastructure/querytube/client.js';
import type { TuiDependencies } from '../tui/state.js';

/** CLI composition; provider configuration remains deferred until import. */
export function createTuiDependencies(
  queryTube: QueryTubeClient = new QueryTubeHttpClient(),
  createNotebookProvider: () => NotebookProvider = () => new NotebookLmCliProvider(),
): TuiDependencies {
  let importer: ImportSearchRunToNotebook | undefined;
  return {
    queryTube,
    get importer() {
      return importer ??= new ImportSearchRunToNotebook(queryTube, createNotebookProvider());
    },
  };
}
