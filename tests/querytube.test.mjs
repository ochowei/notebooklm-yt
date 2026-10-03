import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryTubeHttpClient } from '../dist/infrastructure/querytube/client.js';
import { parseSearchRun, parseSearchRunList } from '../dist/infrastructure/querytube/contract.js';
import { toImportSource, toSearchRunReferences } from '../dist/infrastructure/querytube/mapper.js';
import { detail, summary, video } from './helpers/fixtures.mjs';

const base = 'https://querytube.test';
const code = expected => error => {
  assert.equal(error.code, expected);
  assert.equal(typeof error.message, 'string');
  return true;
};

test('list uses the v1 endpoint, encodes owner ID and returns internal references', async () => {
  const client = new QueryTubeHttpClient(`${base}/`, async (url, options) => {
    assert.equal(String(url), `${base}/api/v1/public/users/user%2F%3F%23%20%E4%B8%AD/search-runs`);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ items: [summary] });
  });
  assert.deepEqual(await client.listSearchRuns('user/?# 中'), [{ userId: 'user/?# 中', searchRunId: 'run-1' }]);
});

test('get uses the v1 endpoint, encodes run ID and maps detail', async () => {
  const client = new QueryTubeHttpClient(base, async url => {
    assert.equal(String(url), `${base}/api/v1/public/users/user-1/search-runs/run%2F%3F%23`);
    return Response.json(detail());
  });
  assert.deepEqual(await client.getSearchRun('user-1', 'run/?#'), {
    userId: 'user-1', searchRunId: 'run-1', videos: [video],
  });
});

test('base URL supports a deployment prefix without hard-coded host', async () => {
  const client = new QueryTubeHttpClient(`${base}/prefix///`, async url => {
    assert.equal(String(url), `${base}/prefix/api/v1/public/users/u/search-runs`);
    return Response.json({ items: [] });
  });
  assert.deepEqual(await client.listSearchRuns('u'), []);
});

test('valid detail and list are validated as minimal API DTOs', () => {
  assert.deepEqual(parseSearchRun(detail()), { id: 'run-1', queryResults: [{ videos: [video] }] });
  assert.deepEqual(parseSearchRunList({ items: [summary] }), { items: [{ id: 'run-1' }] });
});

test('unknown additive fields at every level are ignored', () => {
  const payload = detail([{ ...video, futureVideo: { nested: true } }]);
  payload.futureRun = null;
  payload.queryResults[0].futureQuery = ['new'];
  assert.deepEqual(parseSearchRun(payload), parseSearchRun(detail()));
  assert.deepEqual(parseSearchRunList({ items: [{ ...summary, futureSummary: true }], futureList: {} }),
    { items: [{ id: 'run-1' }] });
});

test('empty videos, empty queries, empty list and empty title are valid', () => {
  assert.deepEqual(parseSearchRun(detail([])).queryResults, [{ videos: [] }]);
  assert.deepEqual(parseSearchRun({ id: 'run-1', queryResults: [] }).queryResults, []);
  assert.deepEqual(parseSearchRunList({ items: [] }), { items: [] });
  assert.equal(parseSearchRun(detail([{ ...video, title: '' }])).queryResults[0].videos[0].title, '');
  assert.deepEqual(toImportSource('u', parseSearchRun(detail([]))).videos, []);
});

test('optional metadata can be omitted, null, or populated', () => {
  for (const value of [undefined, null, 'metadata']) {
    const payload = detail();
    for (const name of ['querySetId', 'querySetName', 'completedAt']) {
      if (value !== undefined) payload[name] = value;
    }
    for (const name of ['relevanceLanguage', 'regionCode', 'errorCode', 'errorMessage']) {
      if (value !== undefined) payload.queryResults[0][name] = value;
    }
    assert.deepEqual(parseSearchRun(payload), parseSearchRun(detail()));
    assert.deepEqual(parseSearchRunList({ items: [payload] }), { items: [{ id: 'run-1' }] });
  }
});

test('malformed required detail fields fail with a contract error and field path', () => {
  const cases = [
    [null, 'response'], [[], 'response'], [{ queryResults: [] }, 'id'],
    [{ id: null, queryResults: [] }, 'id'], [{ id: 1, queryResults: [] }, 'id'],
    [{ id: 'run-1' }, 'queryResults'], [{ id: 'run-1', queryResults: {} }, 'queryResults'],
    [{ id: 'run-1', queryResults: [null] }, 'queryResults[0]'],
    [{ id: 'run-1', queryResults: [{}] }, 'videos'],
    [{ id: 'run-1', queryResults: [{ videos: null }] }, 'videos'],
    [{ id: 'run-1', queryResults: [{ videos: [null] }] }, 'videos[0]'],
  ];
  for (const field of ['videoId', 'url', 'title']) {
    for (const value of [undefined, null, 123, {}]) cases.push([detail([{ ...video, [field]: value }]), field]);
  }
  for (const [payload, field] of cases) {
    assert.throws(() => parseSearchRun(payload), error => {
      code('QUERYTUBE_CONTRACT_INVALID')(error);
      assert.ok(error.message.includes(field));
      return true;
    });
  }
});

test('malformed list envelope or item ID is rejected', () => {
  for (const payload of [null, [], {}, { items: null }, { items: {} }, { items: [null] },
    { items: [{}] }, { items: [{ id: null }] }, { items: [{ id: 123 }] }]) {
    assert.throws(() => parseSearchRunList(payload), code('QUERYTUBE_CONTRACT_INVALID'));
  }
});

test('DTO retains duplicates; import source deduplicates by videoId independent of query/video order', () => {
  const alternative = { ...video, title: 'Alpha' };
  const other = { videoId: 'video-a', title: '', url: 'https://www.youtube.com/watch?v=video-a' };
  const payload = detail([video, { ...video, title: '' }, other]);
  payload.queryResults.push({ videos: [alternative, { ...alternative, url: 'https://www.youtube.com/watch?v=video-b&x=1' }] });
  const dto = parseSearchRun(payload);
  const before = structuredClone(dto);
  assert.equal(dto.queryResults.flatMap(query => query.videos).length, 5);
  const expected = { userId: 'user-1', searchRunId: 'run-1', videos: [other, alternative] };
  assert.deepEqual(toImportSource('user-1', dto), expected);
  assert.deepEqual(dto, before);
  assert.deepEqual(toImportSource('user-1', { ...dto,
    queryResults: [...dto.queryResults].reverse().map(query => ({ videos: [...query.videos].reverse() })),
  }), expected);
  assert.deepEqual(toSearchRunReferences('user-1', parseSearchRunList({ items: [summary] })),
    [{ userId: 'user-1', searchRunId: 'run-1' }]);
});

for (const [status, expected] of [[404, 'QUERYTUBE_NOT_FOUND'], [429, 'QUERYTUBE_RATE_LIMITED'],
  [503, 'QUERYTUBE_UNAVAILABLE'], [500, 'QUERYTUBE_HTTP_ERROR'], [204, 'QUERYTUBE_HTTP_ERROR']]) {
  test(`HTTP ${status} becomes ${expected} for list and get`, async () => {
    const client = new QueryTubeHttpClient(base, async () => new Response(null, { status }));
    await assert.rejects(client.listSearchRuns('u'), code(expected));
    await assert.rejects(client.getSearchRun('u', 'r'), code(expected));
  });
}

test('network failure and timeout are classified without leaking upstream details', async () => {
  for (const failure of [new TypeError('secret transport details'), new DOMException('timeout', 'TimeoutError')]) {
    const client = new QueryTubeHttpClient(base, async () => { throw failure; });
    await assert.rejects(client.listSearchRuns('u'), code('QUERYTUBE_NETWORK_ERROR'));
    await assert.rejects(client.getSearchRun('u', 'r'), code('QUERYTUBE_NETWORK_ERROR'));
  }
});

test('body transport failure is distinct from malformed JSON', async () => {
  const client = new QueryTubeHttpClient(base, async () => ({
    status: 200, text: async () => { throw new TypeError('body transport failure'); },
  }));
  await assert.rejects(client.getSearchRun('u', 'r'), code('QUERYTUBE_NETWORK_ERROR'));
});

test('malformed JSON and valid JSON with broken contract are distinct', async () => {
  const malformed = new QueryTubeHttpClient(base, async () => new Response('{broken'));
  await assert.rejects(malformed.listSearchRuns('u'), code('QUERYTUBE_MALFORMED_JSON'));
  await assert.rejects(malformed.getSearchRun('u', 'r'), code('QUERYTUBE_MALFORMED_JSON'));
  const invalid = new QueryTubeHttpClient(base, async () => Response.json({}));
  await assert.rejects(invalid.listSearchRuns('u'), code('QUERYTUBE_CONTRACT_INVALID'));
  await assert.rejects(invalid.getSearchRun('u', 'r'), code('QUERYTUBE_CONTRACT_INVALID'));
});

test('missing or invalid configuration fails before making requests', () => {
  for (const value of ['', '  ']) assert.throws(() => new QueryTubeHttpClient(value), code('QUERYTUBE_CONFIG_MISSING'));
  for (const value of ['invalid', 'ftp://example.com', `${base}?q=1`, `${base}#fragment`, 'https://user:pass@example.com']) {
    assert.throws(() => new QueryTubeHttpClient(value), code('QUERYTUBE_CONFIG_INVALID'));
  }
});

test('empty and dot IDs fail before making requests', async () => {
  const client = new QueryTubeHttpClient(base, async () => assert.fail('must not fetch'));
  for (const id of ['', ' ', '.', '..']) {
    await assert.rejects(client.listSearchRuns(id), code('CLI_INVALID_ARGUMENTS'));
    await assert.rejects(client.getSearchRun('u', id), code('CLI_INVALID_ARGUMENTS'));
  }
});
