export type ClientErrorCode =
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
