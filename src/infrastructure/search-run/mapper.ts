import type { ImportVideo } from '../../domain/search-run.js';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Prefer a nonempty title, then title and URL lexically. No input order dependency.
function compareVideo(a: ImportVideo, b: ImportVideo): number {
  return Number(a.title === '') - Number(b.title === '')
    || compareText(a.title, b.title) || compareText(a.url, b.url);
}

/** Shared API/export policy: project consumed fields, deduplicate, then sort by video ID. */
export function normalizeImportVideos(videos: readonly ImportVideo[]): readonly ImportVideo[] {
  const unique = new Map<string, ImportVideo>();
  for (const video of videos) {
    const previous = unique.get(video.videoId);
    if (!previous || compareVideo(video, previous) < 0) {
      unique.set(video.videoId, { videoId: video.videoId, url: video.url, title: video.title });
    }
  }
  return [...unique.values()].sort((a, b) => compareText(a.videoId, b.videoId));
}
