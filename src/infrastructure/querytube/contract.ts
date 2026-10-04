import { ClientError } from '../../application/errors.js';

// Validated projections of the v1 wire payload, isolated from application/domain.
export interface QueryTubeVideoDto {
  readonly videoId: string;
  readonly url: string;
  readonly title: string;
}

export interface QueryTubeSearchRunDto {
  readonly id: string;
  readonly queryResults: readonly { readonly videos: readonly QueryTubeVideoDto[] }[];
}

export interface QueryTubeSearchRunSummaryDto {
  readonly id: string;
  readonly querySetId: string | null;
  readonly querySetName: string | null;
  readonly status: 'running' | 'completed' | 'partial' | 'failed';
  readonly queryCount: number;
  readonly successfulQueries: number;
  readonly failedQueries: number;
  readonly totalResults: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
}

export interface QueryTubeSearchRunListDto {
  readonly items: readonly QueryTubeSearchRunSummaryDto[];
}

function invalid(path: string, expected: string): never {
  throw new ClientError('QUERYTUBE_CONTRACT_INVALID', `Invalid QueryTube response: ${path} must be ${expected}.`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'an object');
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, 'an array');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') invalid(path, 'a string');
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : string(value, path);
}

function count(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(path, 'a nonnegative safe integer');
  return value;
}

function status(value: unknown, path: string): QueryTubeSearchRunSummaryDto['status'] {
  if (value !== 'running' && value !== 'completed' && value !== 'partial' && value !== 'failed') {
    invalid(path, 'running, completed, partial, or failed');
  }
  return value;
}

function video(value: unknown, path: string): QueryTubeVideoDto {
  const data = object(value, path);
  return {
    videoId: string(data.videoId, `${path}.videoId`),
    url: string(data.url, `${path}.url`),
    title: string(data.title, `${path}.title`),
  };
}

/** Unknown/unconsumed fields (including optional nullable metadata) are ignored. */
export function parseSearchRun(value: unknown): QueryTubeSearchRunDto {
  const data = object(value, 'response');
  return {
    id: string(data.id, 'id'),
    queryResults: array(data.queryResults, 'queryResults').map((item, index) => {
      const path = `queryResults[${index}]`;
      const query = object(item, path);
      return { videos: array(query.videos, `${path}.videos`).map((item, index) => video(item, `${path}.videos[${index}]`)) };
    }),
  };
}

export function parseSearchRunList(value: unknown): QueryTubeSearchRunListDto {
  const data = object(value, 'response');
  return {
    items: array(data.items, 'items').map((item, index) => {
      const path = `items[${index}]`;
      const summary = object(item, path);
      return {
        id: string(summary.id, `${path}.id`),
        querySetId: nullableString(summary.querySetId, `${path}.querySetId`),
        querySetName: nullableString(summary.querySetName, `${path}.querySetName`),
        status: status(summary.status, `${path}.status`),
        queryCount: count(summary.queryCount, `${path}.queryCount`),
        successfulQueries: count(summary.successfulQueries, `${path}.successfulQueries`),
        failedQueries: count(summary.failedQueries, `${path}.failedQueries`),
        totalResults: count(summary.totalResults, `${path}.totalResults`),
        startedAt: string(summary.startedAt, `${path}.startedAt`),
        completedAt: nullableString(summary.completedAt, `${path}.completedAt`),
        createdAt: string(summary.createdAt, `${path}.createdAt`),
      };
    }),
  };
}
