import assert from 'node:assert/strict';
import { detail } from './fixtures.mjs';

globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'GET');
  assert.equal(new URL(url).pathname, '/api/v1/public/users/user-1/search-runs/run-1');
  if (process.env.NLYT_TEST_FETCH === '404') return new Response('secret token', { status: 404 });
  if (process.env.NLYT_TEST_FETCH === 'unknown') throw new Error('secret cookie /credential/path');
  return Response.json(detail(process.env.NLYT_TEST_FETCH === 'empty' ? [] : ['a', 'b', 'c'].map(videoId => ({
    videoId, title: videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
  }))));
};
