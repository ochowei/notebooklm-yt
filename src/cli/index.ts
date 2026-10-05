#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadEnvFile } from 'node:process';
import { basename, extname } from 'node:path';
import { ClientError } from '../application/errors.js';
import { QueryTubeHttpClient } from '../infrastructure/querytube/client.js';
import { NotebookLmCliProvider } from '../infrastructure/notebooklm/notebook-lm-cli-provider.js';
import { ImportSearchRunToNotebook } from '../application/import-search-run-to-notebook.js';
import { loadSearchRunFile } from '../infrastructure/search-run-file/adapter.js';
import type { ImportReportInput } from './import-output.js';
import { importReport, importExitCode, importHumanOutput } from './import-output.js';
import { createTuiDependencies } from './tui-dependencies.js';

const help = `notebooklm-yt

Usage:
  nlyt search-runs list --user <userId> [--json]
  nlyt search-runs get <runId> --user <userId> [--json]
  nlyt import search-run <runId> --user <userId> --title <notebookTitle> [--video <videoId> ...] [--json]
  nlyt import --search-run-file <path> [--title <notebookTitle>] [--video <videoId> ...] [--json]
  nlyt tui --user <userId>
  nlyt --help

Set QUERYTUBE_BASE_URL in .env (current directory) or your environment.
Reads QueryTube Public API v1 and returns normalized import sources.
Export/download Search Run YAML from QueryTube, then import it directly; no conversion needed.
File import reads generated_at, summary, results[].videos[] (video_id, url, title), optional errors.
File input is exclusive with search-run <runId> / --user; QUERYTUBE_BASE_URL is unused.
Without --title, file import uses the filename stem; no API run ID or owner is required.
Import requires the separately installed NotebookLM CLI and an existing auth session.
Configure NOTEBOOKLM_CLI_PATH, NOTEBOOKLM_STORAGE_PATH, NOTEBOOKLM_TIMEOUT_MS as needed.
Import exit codes: 0 success, 1 failure, 2 partial failure.`;

const tuiHelp = `Usage: nlyt tui --user <userId>

Browse public Search Runs, select videos, enter a title, confirm, and view the Import Report.
Uses cwd .env / environment configuration, just like the CLI import command.
Requires an interactive terminal. QueryTube readiness follows the first successful list.
NotebookLM configuration/authentication is checked during import; authenticate separately.
↑↓ Navigate; Space Toggle; a All; n None; Enter Next/Import; Esc Back; q Quit.
Title entry: type/paste (including q), Backspace deletes, Ctrl+C quits.
During import, normal shortcuts are disabled. Ctrl+C may leave writes unconfirmed.
Check the target NotebookLM state before importing again after forced termination.`;

const args = process.argv.slice(2);
const json = args.includes('--json');
let importing = args.includes('import');
let importInput: ImportReportInput = {};

try {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      user: { type: 'string' },
      'search-run-file': { type: 'string' },
      title: { type: 'string' },
      video: { type: 'string', multiple: true },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  importing = positionals[0] === 'import';
  if (values.help || args.length === 0) {
    const text = positionals[0] === 'tui' ? tuiHelp : help;
    console.log(json ? JSON.stringify({ help: text }) : text);
  } else {
    const [group, command, runId] = positionals;
    importInput = { userId: values.user, searchRunId: runId, notebookTitle: values.title,
      ...(values.video === undefined ? {} : { selection: { videoIds: values.video } }) };
    const filePath = values['search-run-file'];
    if (filePath !== undefined) importInput = { ...importInput, input: { type: 'yaml-file', path: filePath } };
    const validId = (value: string | undefined) => value?.trim() && !value.includes('\0') && value !== '.' && value !== '..';
    const fileCommand = group === 'import' && positionals.length === 1 && filePath !== undefined
      && filePath.trim() && !filePath.includes('\0') && values.user === undefined
      && (values.title === undefined || (values.title.trim() && !values.title.includes('\0')));
    const importCommand = filePath === undefined && group === 'import' && command === 'search-run' && positionals.length === 3
      && validId(runId) && validId(values.user) && values.title?.trim() && !values.title.includes('\0');
    const searchCommand = filePath === undefined && group === 'search-runs' && values.video === undefined && values.title === undefined && validId(values.user)
      && ((command === 'list' && positionals.length === 2)
        || (command === 'get' && positionals.length === 3 && validId(runId)));
    const tuiCommand = filePath === undefined && group === 'tui' && positionals.length === 1 && validId(values.user)
      && values.title === undefined && values.video === undefined && !values.json;
    if (!fileCommand && !importCommand && !searchCommand && !tuiCommand) {
      throw new ClientError('CLI_INVALID_ARGUMENTS', 'Invalid arguments. Use --help for usage.');
    }
    const loadConfiguration = () => {
      try {
        loadEnvFile('.env');
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw new ClientError('QUERYTUBE_CONFIG_INVALID', 'Could not read .env in the current directory.');
        }
      }
    };
    if (tuiCommand) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new ClientError('CLI_INVALID_ARGUMENTS', 'nlyt tui requires an interactive terminal. Use --help for usage.');
      }
      const { startTui } = await import('../tui/index.js');
      await startTui({ userId: values.user!, createDependencies: () => {
        loadConfiguration();
        return createTuiDependencies();
      } });
    } else {
      loadConfiguration();
      if (fileCommand || importCommand) {
        const run = fileCommand ? await loadSearchRunFile(filePath!) : undefined;
        if (run) {
          const stem = basename(filePath!, extname(filePath!));
          importInput = { ...importInput, notebookTitle: values.title ?? (stem.trim() ? stem : 'Search Run') };
        }
        const importer = new ImportSearchRunToNotebook(
          fileCommand ? undefined : new QueryTubeHttpClient(), new NotebookLmCliProvider(),
        );
        const options = {
          notebookTitle: importInput.notebookTitle!,
          ...(values.video === undefined ? {} : { selection: { videoIds: values.video } }),
        };
        const result = run ? await importer.executeRun(options, run)
          : await importer.execute({ ...options, userId: values.user!, searchRunId: runId! });
        const report = importReport(importInput, result);
        console.log(json ? JSON.stringify(report) : importHumanOutput(report));
        process.exitCode = importExitCode(report);
      } else {
        const client = new QueryTubeHttpClient();
        if (command === 'list') {
          const items = await client.listSearchRuns(values.user!);
          console.log(json ? JSON.stringify({ items: items.map(({ userId, searchRunId }) => ({ userId, searchRunId })) })
            : items.length ? items.map(item => item.searchRunId).join('\n') : 'No public Search Runs found.');
        } else {
          const source = await client.getSearchRun(values.user!, runId!);
          console.log(json ? JSON.stringify(source)
            : [`Search Run: ${source.searchRunId}`, `User: ${source.userId}`, `Videos: ${source.videos.length}`,
              ...source.videos.map(video => `${video.videoId}\t${video.title}\t${video.url}`)].join('\n'));
        }
      }
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
