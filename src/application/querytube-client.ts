import type { ImportSource, SearchRunReference } from '../domain/search-run.js';

/** Reads a Search Run and maps its external format into the internal model. */
export interface QueryTubeClient {
  listSearchRuns(userId: string): Promise<readonly SearchRunReference[]>;
  getSearchRun(userId: string, runId: string): Promise<ImportSource>;
}
