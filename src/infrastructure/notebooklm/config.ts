import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ClientError } from '../../application/errors.js';

export interface NotebookLmCliConfig {
  readonly executable: string;
  readonly storagePath: string;
  readonly timeoutMs: number;
}

/** Like the existing HTTP client, reads env at construction; composition loads .env. */
export function notebookLmCliConfig(overrides: Partial<NotebookLmCliConfig> = {}): NotebookLmCliConfig {
  const executable = overrides.executable ?? process.env.NOTEBOOKLM_CLI_PATH ?? 'notebooklm';
  const storagePath = overrides.storagePath ?? process.env.NOTEBOOKLM_STORAGE_PATH
    ?? join(homedir(), '.notebooklm', 'profiles', 'default', 'storage_state.json');
  const timeoutMs = overrides.timeoutMs ?? Number(process.env.NOTEBOOKLM_TIMEOUT_MS ?? 60_000);
  if (![executable, storagePath].every(value => typeof value === 'string' && value.trim() && !value.includes('\0'))
    || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new ClientError('NOTEBOOKLM_CONFIG_INVALID', 'Set a valid NotebookLM executable, storage path, and positive timeout in milliseconds.');
  }
  return { executable, storagePath: resolve(storagePath), timeoutMs };
}
