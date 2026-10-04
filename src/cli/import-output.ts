import { ClientError } from '../application/errors.js';
import type { ImportSearchRunInput, ImportSearchRunResult } from '../application/import-search-run-to-notebook.js';

/** Presentation contract only; application results remain authoritative. */
export function importReport(input: Partial<ImportSearchRunInput>, result?: ImportSearchRunResult, error?: unknown) {
  const attempted = result?.sources.length ?? 0;
  const succeeded = result?.sources.filter(source => source.status === 'success').length ?? 0;
  const failed = attempted - succeeded;
  return {
    status: !result || succeeded === 0 ? 'failure' : failed ? 'partial_failure' : 'success',
    userId: input.userId ?? null,
    searchRunId: input.searchRunId ?? null,
    notebook: { title: result?.notebook.title ?? input.notebookTitle ?? null,
      created: result !== undefined, id: result?.notebook.id ?? null },
    sources: { attempted, succeeded, failed },
    errors: result ? result.sources.flatMap(source => source.status === 'failure'
      ? [{ code: source.error.code, source: source.source }] : [])
      : [{ code: error instanceof ClientError ? error.code : 'INTERNAL_ERROR' }],
  };
}

export function importExitCode(report: ReturnType<typeof importReport>): number {
  return report.status === 'success' ? 0 : report.status === 'partial_failure' ? 2 : 1;
}

export function importHumanOutput(report: ReturnType<typeof importReport>): string {
  return [
    'Search Run', `- user: ${report.userId ?? '(not provided)'}`, `- run: ${report.searchRunId ?? '(not provided)'}`,
    '', 'Notebook', `- title: ${report.notebook.title ?? '(not provided)'}`,
    `- created: ${report.notebook.created ? 'yes' : 'no (not confirmed)'}`,
    ...(report.notebook.id ? [`- id: ${report.notebook.id}`] : []),
    '', 'Sources', `- attempted: ${report.sources.attempted}`, `- succeeded: ${report.sources.succeeded}`,
    `- failed: ${report.sources.failed}`, '', 'Result', `- ${report.status.replace('_', ' ')}`,
    ...report.errors.map(error => `- error: ${error.code}${'source' in error ? ` (video: ${error.source.videoId})` : ''}`),
    ...(report.status === 'failure' ? ['Use --help for usage and configuration. Authenticate separately if NOTEBOOKLM_AUTH_REQUIRED.',
      'If a write was not confirmed, inspect the target notebook before repeating it.'] : []),
  ].join('\n');
}
