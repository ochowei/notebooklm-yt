import assert from 'node:assert/strict';
import { detail, summary } from './fixtures.mjs';

// Test-only terminal surface for the compiled Ink entry point, using piped keyboard input.
process.stdin.isTTY = true;
process.stdin.setRawMode = () => {};
process.stdout.isTTY = true;
process.stdout.columns = 100;
process.stdout.rows = 24;
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'GET');
  const path = new URL(url).pathname;
  if (path === '/api/v1/public/users/user-1/search-runs') return Response.json({ items: [summary] });
  assert.equal(path, '/api/v1/public/users/user-1/search-runs/run-1');
  return Response.json(detail(['a', 'b', 'c'].map(videoId => ({
    videoId, title: `Video ${videoId}`, url: `https://www.youtube.com/watch?v=${videoId}`,
  }))));
};
