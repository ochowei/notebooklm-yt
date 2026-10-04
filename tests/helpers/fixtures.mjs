export const video = { videoId: 'video-b', url: 'https://www.youtube.com/watch?v=video-b', title: 'Title B' };

// Real-shaped v1 summary, including nullable association metadata.
export const summary = {
  id: 'run-1', querySetId: 'qs-1', querySetName: 'WoW Forever Multilingual',
  completedAt: '2026-10-01T02:10:15.000Z', status: 'completed', queryCount: 1, successfulQueries: 1,
  failedQueries: 0, totalResults: 1, startedAt: '2026-10-01T02:10:00.000Z',
  createdAt: '2026-10-01T02:10:00.000Z', visibility: 'public',
};

export function detail(videos = [video]) {
  return {
    ...summary, inputYaml: 'version: 1',
    queryResults: [{
      id: 'query-1', sourceQueryId: 'query-1', query: 'test', status: 'success',
      resultCount: videos.length, startedAt: '', completedAt: '',
      videos: videos.map(item => ({
        channelId: '', channelTitle: '', publishedAt: '', description: '', thumbnailUrl: '', ...item,
      })),
    }],
  };
}

export const summaryDto = { ...summary };
delete summaryDto.visibility;
export function internalSummary(userId, item = summaryDto) {
  const { id, ...metadata } = item;
  return { userId, searchRunId: id, ...metadata };
}
