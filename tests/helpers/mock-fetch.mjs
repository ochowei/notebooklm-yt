import assert from 'node:assert/strict';
import { detail, summary } from './fixtures.mjs';

// Loaded only by CLI subprocess tests; no production hooks or external services.
globalThis.fetch = async (url, options) => {
  assert.equal(options.method, 'GET');
  assert.equal(options.headers.Accept, 'application/json');
  const path = new URL(url).pathname;
  assert.match(path, /^\/api\/v1\/public\/users\/user-1\/search-runs(?:\/run-1)?$/);
  switch (process.env.NLYT_TEST_RESPONSE) {
    case 'network': throw new TypeError('mock network failure');
    case 'malformed': return new Response('{broken');
    case 'contract': return Response.json({ id: 'run-1', queryResults: null });
    case '404': case '429': case '503': case '500':
      return new Response('upstream text must not leak', { status: Number(process.env.NLYT_TEST_RESPONSE) });
    case 'empty': return Response.json(path.endsWith('/run-1') ? detail([]) : { items: [] });
    default: return Response.json(path.endsWith('/run-1') ? detail() : { items: [summary] });
  }
};
