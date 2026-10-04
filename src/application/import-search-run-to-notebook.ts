import type { Notebook, NotebookSource } from '../domain/notebook.js';
import type { ImportVideo, SearchRunReference } from '../domain/search-run.js';
import { ClientError } from './errors.js';
import type { ClientErrorCode } from './errors.js';
import { createImportContext, generateImportId, ImportSearchRunError } from './import-context.js';
import type { ImportContextDependencies } from './import-context.js';
import type { NotebookProvider } from './notebook-provider.js';
import type { QueryTubeClient } from './querytube-client.js';

export interface ImportSearchRunInput extends SearchRunReference {
  readonly notebookTitle: string;
}

export type ImportSourceResult =
  | { readonly source: ImportVideo; readonly status: 'success'; readonly notebookSource: NotebookSource }
  | { readonly source: ImportVideo; readonly status: 'failure'; readonly error: { readonly code: ClientErrorCode } };

export interface ImportSearchRunResult {
  readonly importId: string;
  readonly createdAt: string;
  readonly notebook: Notebook;
  readonly sources: readonly ImportSourceResult[];
}

function validate(input: ImportSearchRunInput): void {
  if (![input.userId, input.searchRunId, input.notebookTitle].every(value =>
    typeof value === 'string' && value.trim() && !value.includes('\0'))
    || [input.userId, input.searchRunId].some(value => value === '.' || value === '..')) {
    throw new ClientError('IMPORT_INVALID_ARGUMENTS', 'User ID, Search Run ID, and notebook title must be nonempty strings without NUL characters; IDs must be valid path identifiers.');
  }
}

/** Imports the internal source order once, retaining results even when every add fails. */
export class ImportSearchRunToNotebook {
  constructor(
    private readonly queryTube: QueryTubeClient,
    private readonly notebooks: NotebookProvider,
    private readonly contextDependencies: ImportContextDependencies = {
      clock: () => new Date(), generateId: generateImportId,
    },
  ) {}

  async execute(input: ImportSearchRunInput): Promise<ImportSearchRunResult> {
    validate(input);
    const context = createImportContext(input.notebookTitle, this.contextDependencies);
    try {
      const run = await this.queryTube.getSearchRun(input.userId, input.searchRunId);
      if (run.videos.length === 0) {
        throw new ClientError('IMPORT_NO_SOURCES', 'Search Run has no YouTube sources to import.');
      }

      const notebook = await this.notebooks.createNotebook(context.notebookTitle);
      const sources: ImportSourceResult[] = [];
      for (const source of run.videos) {
        try {
          const notebookSource = await this.notebooks.addYouTubeSource(notebook.id, source.url);
          sources.push({ source, status: 'success', notebookSource });
        } catch (error: unknown) {
          sources.push({ source, status: 'failure', error: {
            code: error instanceof ClientError ? error.code : 'INTERNAL_ERROR',
          } });
        }
      }
      return { importId: context.importId, createdAt: context.createdAt, notebook, sources };
    } catch (error: unknown) {
      throw new ImportSearchRunError(context, error);
    }
  }
}
