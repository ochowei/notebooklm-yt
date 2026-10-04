import type { ClientErrorCode } from '../application/errors.js';
import type { ImportSearchRunToNotebook, ImportSearchRunResult } from '../application/import-search-run-to-notebook.js';
import type { QueryTubeClient } from '../application/querytube-client.js';
import type { ImportSource, SearchRunReference } from '../domain/search-run.js';

export interface TuiDependencies {
  readonly queryTube: QueryTubeClient;
  readonly importer: Pick<ImportSearchRunToNotebook, 'execute'>;
}

export interface BrowserState {
  readonly runs: readonly SearchRunReference[];
  readonly runIndex: number;
}

export interface ImportDraft extends BrowserState {
  readonly run: ImportSource;
  readonly selected: ReadonlySet<string>;
  readonly videoIndex: number;
  readonly title: string;
  readonly notice?: string;
}

/** Navigation has one active screen; selection stores only domain video IDs. */
export type TuiState =
  | { readonly screen: 'loading'; readonly label: string; readonly back?: BrowserState }
  | ({ readonly screen: 'search-runs' } & BrowserState)
  | { readonly screen: 'videos' | 'title' | 'confirm'; readonly draft: ImportDraft }
  | { readonly screen: 'importing'; readonly draft: ImportDraft }
  | { readonly screen: 'report'; readonly draft: ImportDraft; readonly result: ImportSearchRunResult }
  | { readonly screen: 'error'; readonly code: ClientErrorCode; readonly back?: BrowserState };
