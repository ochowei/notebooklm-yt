export type ClientErrorCode =
  | 'IMPORT_INVALID_ARGUMENTS'
  | 'IMPORT_NO_SOURCES'
  | 'IMPORT_NO_SELECTED_SOURCES'
  | 'IMPORT_INVALID_SELECTION'
  | 'NOTEBOOKLM_AUTH_REQUIRED'
  | 'NOTEBOOKLM_CONFIG_INVALID'
  | 'NOTEBOOKLM_TIMEOUT'
  | 'NOTEBOOKLM_PROCESS_ERROR'
  | 'NOTEBOOKLM_INVALID_RESPONSE'
  | 'NOTEBOOKLM_BACKEND_ERROR'
  | 'QUERYTUBE_CONFIG_MISSING'
  | 'QUERYTUBE_CONFIG_INVALID'
  | 'QUERYTUBE_NETWORK_ERROR'
  | 'QUERYTUBE_MALFORMED_JSON'
  | 'QUERYTUBE_CONTRACT_INVALID'
  | 'QUERYTUBE_NOT_FOUND'
  | 'QUERYTUBE_RATE_LIMITED'
  | 'QUERYTUBE_UNAVAILABLE'
  | 'QUERYTUBE_HTTP_ERROR'
  | 'CLI_INVALID_ARGUMENTS'
  | 'INTERNAL_ERROR';

/** Stable consumer error codes; upstream response text is not a public guarantee. */
export class ClientError extends Error {
  constructor(readonly code: ClientErrorCode, message: string) {
    super(message);
    this.name = 'ClientError';
  }
}
