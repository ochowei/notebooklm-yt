import type { SearchRun } from '../domain/search-run.js';

/** Reads a Search Run and maps its external format into the internal model. */
export interface QueryTubeClient {
  getSearchRun(runId: string): Promise<SearchRun>;
}
