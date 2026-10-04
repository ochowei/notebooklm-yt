import { ClientError } from '../application/errors.js';
import type { ClientErrorCode } from '../application/errors.js';

const messages: Record<ClientErrorCode, string> = {
  QUERYTUBE_CONFIG_MISSING: 'Set QUERYTUBE_BASE_URL in your environment or cwd .env.',
  QUERYTUBE_CONFIG_INVALID: 'Check QUERYTUBE_BASE_URL and that cwd .env can be read.',
  QUERYTUBE_NETWORK_ERROR: 'Could not reach QueryTube. Check your connection.',
  QUERYTUBE_NOT_FOUND: 'Search Run was not found or is not public.',
  QUERYTUBE_MALFORMED_JSON: 'QueryTube returned an unreadable response.',
  QUERYTUBE_CONTRACT_INVALID: 'QueryTube returned an incompatible response.',
  QUERYTUBE_RATE_LIMITED: 'QueryTube is rate limiting requests. Try again later.',
  QUERYTUBE_UNAVAILABLE: 'QueryTube is temporarily unavailable.',
  QUERYTUBE_HTTP_ERROR: 'QueryTube could not complete the request.',
  NOTEBOOKLM_CONFIG_INVALID: 'Check your separately installed NotebookLM CLI and its configuration.',
  NOTEBOOKLM_AUTH_REQUIRED: 'NotebookLM authentication is missing or expired. Authenticate separately.',
  NOTEBOOKLM_BACKEND_ERROR: 'NotebookLM could not confirm the operation.',
  NOTEBOOKLM_TIMEOUT: 'NotebookLM did not confirm the operation before the timeout.',
  NOTEBOOKLM_PROCESS_ERROR: 'NotebookLM CLI could not complete the operation.',
  NOTEBOOKLM_INVALID_RESPONSE: 'NotebookLM returned an unreadable response.',
  IMPORT_INVALID_SELECTION: 'The selection no longer matches this Search Run.',
  IMPORT_NO_SELECTED_SOURCES: 'Select at least one video to continue.',
  IMPORT_NO_SOURCES: 'This Search Run has no YouTube sources to import.',
  IMPORT_INVALID_ARGUMENTS: 'Enter a valid user, Search Run, and notebook title.',
  CLI_INVALID_ARGUMENTS: 'Check command arguments with nlyt tui --help.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};

export function errorCode(error: unknown): ClientErrorCode {
  return error instanceof ClientError ? error.code : 'INTERNAL_ERROR';
}

export function friendlyError(code: ClientErrorCode): string {
  return messages[code];
}

/** Terminal control characters in domain labels must not become terminal commands. */
export function displayText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}
