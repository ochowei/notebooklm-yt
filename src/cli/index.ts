#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadEnvFile } from 'node:process';
import { ClientError } from '../application/errors.js';
import { QueryTubeHttpClient } from '../infrastructure/querytube/client.js';
import { NotebookLmCliProvider } from '../infrastructure/notebooklm/notebook-lm-cli-provider.js';
import { ImportSearchRunToNotebook } from '../application/import-search-run-to-notebook.js';
import type { ImportSearchRunInput } from '../application/import-search-run-to-notebook.js';
import { importReport, importExitCode, importHumanOutput } from './import-output.js';

const help = `notebooklm-yt

Usage:
  nlyt search-runs list --user <userId> [--json]
  nlyt search-runs get <runId> --user <userId> [--json]
  nlyt import search-run <runId> --user <userId> --title <notebookTitle> [--video <videoId> ...] [--json]
  nlyt --help

Set QUERYTUBE_BASE_URL in .env (current directory) or your environment.
Reads QueryTube Public API v1 and returns normalized import sources.
Import requires the separately installed NotebookLM CLI and an existing auth session.
Configure NOTEBOOKLM_CLI_PATH, NOTEBOOKLM_STORAGE_PATH, NOTEBOOKLM_TIMEOUT_MS as needed.
Import exit codes: 0 success, 1 failure, 2 partial failure.`;

const args = process.argv.slice(2);
const json = args.includes('--json');
let importing = args.includes('import');
let importInput: Partial<ImportSearchRunInput> = {};

try {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      user: { type: 'string' },
      title: { type: 'string' },
      video: { type: 'string', multiple: true },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  importing = positionals[0] === 'import';
  if (values.help || args.length === 0) {
    console.log(json ? JSON.stringify({ help }) : help);
  } else {
    const [group, command, runId] = positionals;
    importInput = { userId: values.user, searchRunId: runId, notebookTitle: values.title,
      ...(values.video === undefined ? {} : { selection: { videoIds: values.video } }) };
    const validId = (value: string | undefined) => value?.trim() && !value.includes('\0') && value !== '.' && value !== '..';
    const importCommand = group === 'import' && command === 'search-run' && positionals.length === 3
      && validId(runId) && validId(values.user) && values.title?.trim() && !values.title.includes('\0');
    const searchCommand = group === 'search-runs' && values.video === undefined && values.title === undefined && validId(values.user)
      && ((command === 'list' && positionals.length === 2)
        || (command === 'get' && positionals.length === 3 && validId(runId)));
    if (!importCommand && !searchCommand) {
      throw new ClientError('CLI_INVALID_ARGUMENTS', 'Invalid arguments. Use --help for usage.');
    }
    try {
      loadEnvFile('.env');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new ClientError('QUERYTUBE_CONFIG_INVALID', 'Could not read .env in the current directory.');
      }
    }
    const client = new QueryTubeHttpClient();
    if (importCommand) {
      const result = await new ImportSearchRunToNotebook(client, new NotebookLmCliProvider()).execute({
        userId: values.user!, searchRunId: runId!, notebookTitle: values.title!,
        ...(values.video === undefined ? {} : { selection: { videoIds: values.video } }),
      });
      const report = importReport(importInput, result);
      console.log(json ? JSON.stringify(report) : importHumanOutput(report));
      process.exitCode = importExitCode(report);
    } else if (command === 'list') {
      const items = await client.listSearchRuns(values.user!);
      console.log(json ? JSON.stringify({ items })
        : items.length ? items.map(item => item.searchRunId).join('\n') : 'No public Search Runs found.');
    } else {
      const source = await client.getSearchRun(values.user!, runId!);
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
  if (importing) {
    const report = importReport(importInput, undefined, failure);
    if (json) console.log(JSON.stringify(report));
    else console.error(importHumanOutput(report));
  } else if (json) console.log(JSON.stringify({ error: { code: failure.code, message: failure.message } }));
  else console.error(failure.message);
  process.exitCode = 1;
}
