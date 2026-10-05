import type { ImportSource, SearchRunSummary } from '../../domain/search-run.js';
import { normalizeImportVideos } from '../search-run/mapper.js';
import type { QueryTubeSearchRunDto, QueryTubeSearchRunListDto } from './contract.js';

export function toImportSource(userId: string, run: QueryTubeSearchRunDto): ImportSource {
  return {
    userId, searchRunId: run.id,
    videos: normalizeImportVideos(run.queryResults.flatMap(query => query.videos)),
  };
}

export function toSearchRunSummaries(userId: string, list: QueryTubeSearchRunListDto): readonly SearchRunSummary[] {
  return list.items.map(item => ({
    userId, searchRunId: item.id,
    querySetId: item.querySetId, querySetName: item.querySetName, status: item.status,
    queryCount: item.queryCount, successfulQueries: item.successfulQueries,
    failedQueries: item.failedQueries, totalResults: item.totalResults,
    startedAt: item.startedAt, completedAt: item.completedAt, createdAt: item.createdAt,
  }));
}
