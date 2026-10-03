#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadEnvFile } from 'node:process';
import { ClientError } from '../application/errors.js';
import { QueryTubeHttpClient } from '../infrastructure/querytube/client.js';

const help = `notebooklm-yt

Usage:
  nlyt search-runs list --user <userId> [--json]
  nlyt search-runs get <runId> --user <userId> [--json]
  nlyt --help

Set QUERYTUBE_BASE_URL in .env (current directory) or your environment.
Reads QueryTube Public API v1 and returns normalized import sources.
NotebookLM import is not implemented yet.`;

const args = process.argv.slice(2);
const json = args.includes('--json');

try {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      user: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || args.length === 0) {
    console.log(json ? JSON.stringify({ help }) : help);
  } else {
    const [group, command, runId] = positionals;
    if (group !== 'search-runs' || !values.user?.trim()
      || !((command === 'list' && positionals.length === 2)
        || (command === 'get' && positionals.length === 3 && runId?.trim()))) {
      throw new ClientError('CLI_INVALID_ARGUMENTS', 'Use search-runs list --user <userId> or search-runs get <runId> --user <userId>. NotebookLM import is not implemented yet.');
    }
    try {
      loadEnvFile('.env');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new ClientError('QUERYTUBE_CONFIG_INVALID', 'Could not read .env in the current directory.');
      }
    }
    const client = new QueryTubeHttpClient();
    if (command === 'list') {
      const items = await client.listSearchRuns(values.user);
      console.log(json ? JSON.stringify({ items })
        : items.length ? items.map(item => item.searchRunId).join('\n') : 'No public Search Runs found.');
    } else {
      const source = await client.getSearchRun(values.user, runId!);
      console.log(json ? JSON.stringify(source)
        : [`Search Run: ${source.searchRunId}`, `User: ${source.userId}`, `Videos: ${source.videos.length}`,
          ...source.videos.map(video => `${video.videoId}\t${video.title}\t${video.url}`)].join('\n'));
    }
  }
} catch (error) {
  const failure = error instanceof ClientError ? error
    : error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_')
      ? new ClientError('CLI_INVALID_ARGUMENTS', 'Invalid arguments. Use --help for usage.')
      : new ClientError('INTERNAL_ERROR', 'An unexpected error occurred.');
  if (json) console.log(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  else console.error(failure.message);
  process.exitCode = 1;
}
