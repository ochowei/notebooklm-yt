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

export interface ImportSource extends SearchRunReference {
  readonly videos: readonly ImportVideo[];
}
