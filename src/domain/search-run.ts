// Only the data needed by the future import workflow, independent of API DTOs.
export interface ImportVideo {
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
}

export interface SearchRunReference {
  readonly userId: string;
  readonly searchRunId: string;
}

/** Reusable list metadata, independent of wire DTOs and presentation. */
export interface SearchRunSummary extends SearchRunReference {
  readonly querySetId: string | null;
  readonly querySetName: string | null;
  readonly status: 'running' | 'completed' | 'partial' | 'failed';
  readonly queryCount: number;
  readonly successfulQueries: number;
  readonly failedQueries: number;
  readonly totalResults: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
}

/** Normalized import data; source identity is separate from the shared workflow. */
export interface SearchRun {
  readonly videos: readonly ImportVideo[];
}

export interface ImportSource extends SearchRun, SearchRunReference {}
