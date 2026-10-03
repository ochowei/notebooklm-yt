import { ClientError } from '../../application/errors.js';
import type { QueryTubeClient } from '../../application/querytube-client.js';
import type { ImportSource, SearchRunReference } from '../../domain/search-run.js';
import { parseSearchRun, parseSearchRunList } from './contract.js';
import { toImportSource, toSearchRunReferences } from './mapper.js';

function baseUrl(value: string | undefined): URL {
  if (!value?.trim()) {
    throw new ClientError('QUERYTUBE_CONFIG_MISSING', 'Set QUERYTUBE_BASE_URL to the QueryTube server URL.');
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid base URL');
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    return url;
  } catch {
    throw new ClientError('QUERYTUBE_CONFIG_INVALID', 'QUERYTUBE_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }
}

function segment(value: string): string {
  if (!value.trim() || value === '.' || value === '..') {
    throw new ClientError('CLI_INVALID_ARGUMENTS', 'User and Search Run IDs must be nonempty path identifiers.');
  }
  return encodeURIComponent(value);
}

/** HTTP + validation + mapping; the application port returns internal models only. */
export class QueryTubeHttpClient implements QueryTubeClient {
  private readonly base: URL;

  constructor(
    url: string | undefined = process.env.QUERYTUBE_BASE_URL,
    private readonly fetchRequest: typeof fetch = fetch,
  ) {
    this.base = baseUrl(url);
  }

  async listSearchRuns(userId: string): Promise<readonly SearchRunReference[]> {
    const payload = await this.read(`api/v1/public/users/${segment(userId)}/search-runs`);
    return toSearchRunReferences(userId, parseSearchRunList(payload));
  }

  async getSearchRun(userId: string, runId: string): Promise<ImportSource> {
    const payload = await this.read(`api/v1/public/users/${segment(userId)}/search-runs/${segment(runId)}`);
    return toImportSource(userId, parseSearchRun(payload));
  }

  private async read(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchRequest(new URL(path, this.base), {
        method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw new ClientError('QUERYTUBE_NETWORK_ERROR', 'Could not reach QueryTube; check the server URL and connection (request timeout: 15 seconds).');
    }

    switch (response.status) {
      case 200: break;
      case 404: throw new ClientError('QUERYTUBE_NOT_FOUND', 'Search Run was not found or is not public.');
      case 429: throw new ClientError('QUERYTUBE_RATE_LIMITED', 'QueryTube rate limit reached; try again later.');
      case 503: throw new ClientError('QUERYTUBE_UNAVAILABLE', 'QueryTube storage or backend is unavailable; try again later.');
      default: throw new ClientError('QUERYTUBE_HTTP_ERROR', `QueryTube returned unexpected HTTP status ${response.status}.`);
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ClientError('QUERYTUBE_NETWORK_ERROR', 'Could not read the QueryTube response; check the connection.');
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ClientError('QUERYTUBE_MALFORMED_JSON', 'QueryTube returned malformed JSON.');
    }
  }
}
