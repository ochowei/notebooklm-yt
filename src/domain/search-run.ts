// Internal normalized model; this is not the QueryTube API or export schema.
export interface YouTubeSearchResult {
  readonly videoId: string;
  readonly title: string;
  readonly url: string;
}

export interface SearchRun {
  readonly id: string;
  readonly query: string;
  readonly results: readonly YouTubeSearchResult[];
}
