import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { ClientError } from '../../application/errors.js';
import type { SearchRun } from '../../domain/search-run.js';
import { normalizeImportVideos } from '../search-run/mapper.js';

function invalid(): never {
  throw new ClientError('SEARCH_RUN_SCHEMA_INVALID', 'Invalid QueryTube Search Run export structure.');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}

function string(value: unknown, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && (!value.trim() || value.includes('\0')))) invalid();
  return value;
}

/** QueryTube exported YAML uses snake_case and has no API run/owner identity.
 * Validate the export envelope; only consumed video fields cross this boundary.
 * A future versioned representation can be mapped here without changing the use case.
 */
export function normalizeSearchRunFile(value: unknown): SearchRun {
  const data = object(value);
  string(data.generated_at, true);
  const summary = object(data.summary);
  for (const field of ['queries', 'successful', 'failed', 'total_results']) {
    const count = summary[field];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) invalid();
  }
  if (data.errors !== undefined) array(data.errors);
  const videos = array(data.results).flatMap(item => array(object(item).videos).map(item => {
    const video = object(item);
    return {
      videoId: string(video.video_id, true),
      title: string(video.title),
      url: string(video.url, true),
    };
  }));
  const normalized = normalizeImportVideos(videos);
  if (normalized.length === 0) {
    throw new ClientError('SEARCH_RUN_EMPTY', 'Search Run has no YouTube sources to import.');
  }
  return { videos: normalized };
}

/** Read/parse/normalize only; never performs NotebookLM writes. */
export async function loadSearchRunFile(path: string): Promise<SearchRun> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    const missing = error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
    throw new ClientError(missing ? 'SEARCH_RUN_FILE_NOT_FOUND' : 'SEARCH_RUN_FILE_READ_ERROR',
      missing ? 'Search Run file was not found.' : 'Could not read Search Run file.');
  }
  let value: unknown;
  try {
    const document = parseDocument(text, { prettyErrors: false });
    if (document.errors.length || document.warnings.length) throw new Error('Invalid YAML');
    value = document.toJS({ maxAliasCount: 100 }) as unknown;
  } catch {
    throw new ClientError('SEARCH_RUN_YAML_INVALID', 'Could not parse Search Run YAML.');
  }
  return normalizeSearchRunFile(value);
}
