import type { ImportSource, ImportVideo, SearchRunReference } from '../../domain/search-run.js';
import type { QueryTubeSearchRunDto, QueryTubeSearchRunListDto } from './contract.js';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Prefer a nonempty title, then title and URL lexically. No API order dependency.
function compareVideo(a: ImportVideo, b: ImportVideo): number {
  return Number(a.title === '') - Number(b.title === '')
    || compareText(a.title, b.title) || compareText(a.url, b.url);
}

export function toImportSource(userId: string, run: QueryTubeSearchRunDto): ImportSource {
  const unique = new Map<string, ImportVideo>();
  for (const query of run.queryResults) {
    for (const video of query.videos) {
      const previous = unique.get(video.videoId);
      if (!previous || compareVideo(video, previous) < 0) {
        unique.set(video.videoId, { videoId: video.videoId, url: video.url, title: video.title });
      }
    }
  }
  return {
    userId, searchRunId: run.id,
    videos: [...unique.values()].sort((a, b) => compareText(a.videoId, b.videoId)),
  };
}

export function toSearchRunReferences(userId: string, list: QueryTubeSearchRunListDto): SearchRunReference[] {
  return list.items.map(item => ({ userId, searchRunId: item.id }));
}
