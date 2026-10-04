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
  readonly selection?: { readonly videoIds: readonly string[] };
}

/** Temporary workflow observations; the returned source results remain authoritative. */
export type ImportProgressEvent =
  | { readonly phase: 'creating_notebook'; readonly total: number }
  | {
      readonly phase: 'importing_sources';
      readonly completed: number;
      readonly total: number;
      readonly succeeded: number;
      readonly failed: number;
    };

export interface ImportExecutionOptions {
  readonly onProgress?: (event: ImportProgressEvent) => void;
}

function emitProgress(options: ImportExecutionOptions | undefined, event: ImportProgressEvent): void {
  try {
    options?.onProgress?.(event);
  } catch {
    // Observation is non-authoritative and must not affect notebook writes or results.
  }
}

export type ImportSourceResult =
  | { readonly source: ImportVideo; readonly status: 'success'; readonly notebookSource: NotebookSource }
  | { readonly source: ImportVideo; readonly status: 'failure'; readonly error: { readonly code: ClientErrorCode } }
  | { readonly source: ImportVideo; readonly status: 'skipped'; readonly reason: 'not_selected' };

export interface ImportSearchRunResult {
  readonly importId: string;
  readonly createdAt: string;
  readonly notebook: Notebook;
  readonly sources: readonly ImportSourceResult[];
}

/** Shared report semantics, derived from the authoritative application source results. */
export function summarizeImportSources(sources: readonly ImportSourceResult[]) {
  const succeeded = sources.filter(source => source.status === 'success').length;
  const failed = sources.filter(source => source.status === 'failure').length;
  const skipped = sources.filter(source => source.status === 'skipped').length;
  const attempted = succeeded + failed;
  const status: 'success' | 'partial_failure' | 'failure' = succeeded === 0
    ? 'failure' : failed > 0 ? 'partial_failure' : 'success';
  return { status, summary: { total: sources.length, selected: attempted, attempted, succeeded, failed, skipped } };
}

function validate(input: ImportSearchRunInput): void {
  if (![input.userId, input.searchRunId, input.notebookTitle].every(value =>
    typeof value === 'string' && value.trim() && !value.includes('\0'))
    || [input.userId, input.searchRunId].some(value => value === '.' || value === '..')) {
    throw new ClientError('IMPORT_INVALID_ARGUMENTS', 'User ID, Search Run ID, and notebook title must be nonempty strings without NUL characters; IDs must be valid path identifiers.');
  }
}

/** Imports selected sources in internal order, retaining results even when every add fails. */
export class ImportSearchRunToNotebook {
  constructor(
    private readonly queryTube: QueryTubeClient,
    private readonly notebooks: NotebookProvider,
    private readonly contextDependencies: ImportContextDependencies = {
      clock: () => new Date(), generateId: generateImportId,
    },
  ) {}

  async execute(input: ImportSearchRunInput, options?: ImportExecutionOptions): Promise<ImportSearchRunResult> {
    validate(input);
    const context = createImportContext(input.notebookTitle, this.contextDependencies);
    try {
      if (input.selection !== undefined && (!input.selection || !Array.isArray(input.selection.videoIds)
        || !input.selection.videoIds.every(id => typeof id === 'string'))) {
        throw new ClientError('IMPORT_INVALID_SELECTION', 'Selection must contain an array of video IDs.');
      }
      const selectedIds = input.selection === undefined ? undefined : new Set(input.selection.videoIds);
      if (selectedIds?.size === 0) {
        throw new ClientError('IMPORT_NO_SELECTED_SOURCES', 'Select at least one source to import.');
      }
      const run = await this.queryTube.getSearchRun(input.userId, input.searchRunId);
      if (selectedIds) {
        const availableIds = new Set(run.videos.map(source => source.videoId));
        if ([...selectedIds].some(id => !availableIds.has(id))) {
          throw new ClientError('IMPORT_INVALID_SELECTION', 'Selection contains video IDs absent from the Search Run.');
        }
      }
      if (run.videos.length === 0) {
        throw new ClientError('IMPORT_NO_SOURCES', 'Search Run has no YouTube sources to import.');
      }

      const total = run.videos.filter(source => !selectedIds || selectedIds.has(source.videoId)).length;
      emitProgress(options, { phase: 'creating_notebook', total });
      const notebook = await this.notebooks.createNotebook(context.notebookTitle);
      const sources: ImportSourceResult[] = [];
      let succeeded = 0;
      let failed = 0;
      emitProgress(options, { phase: 'importing_sources', completed: 0, total, succeeded, failed });
      for (const source of run.videos) {
        if (selectedIds && !selectedIds.has(source.videoId)) {
          sources.push({ source, status: 'skipped', reason: 'not_selected' });
          continue;
        }
        try {
          const notebookSource = await this.notebooks.addYouTubeSource(notebook.id, source.url);
          sources.push({ source, status: 'success', notebookSource });
          succeeded++;
        } catch (error: unknown) {
          sources.push({ source, status: 'failure', error: {
            code: error instanceof ClientError ? error.code : 'INTERNAL_ERROR',
          } });
          failed++;
        }
        emitProgress(options, { phase: 'importing_sources', completed: succeeded + failed, total, succeeded, failed });
      }
      return { importId: context.importId, createdAt: context.createdAt, notebook, sources };
    } catch (error: unknown) {
      throw new ImportSearchRunError(context, error);
    }
  }
}
