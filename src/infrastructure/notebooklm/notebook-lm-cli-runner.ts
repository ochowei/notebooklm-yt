import { execFile } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { ClientError } from '../../application/errors.js';
import { notebookLmCliConfig } from './config.js';
import type { NotebookLmCliConfig } from './config.js';

/** Infrastructure seam: a fake runner returns unknown JSON, never backend types. */
export interface NotebookLmRunner {
  run(args: readonly string[]): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function backendFailure(code: unknown): ClientError {
  if (code === 'AUTH_REQUIRED' || code === 'AUTH_ERROR') {
    return new ClientError('NOTEBOOKLM_AUTH_REQUIRED', 'NotebookLM authentication is missing or expired; authenticate separately.');
  }
  if (code === 'CONFIG_ERROR') {
    return new ClientError('NOTEBOOKLM_CONFIG_INVALID', 'NotebookLM CLI configuration is invalid.');
  }
  return new ClientError('NOTEBOOKLM_BACKEND_ERROR', 'NotebookLM could not confirm the operation. Inspect the target notebook before repeating a write.');
}

/** No shell, logs, retries, or raw process errors cross this boundary. */
export class NotebookLmCliRunner implements NotebookLmRunner {
  private readonly config: NotebookLmCliConfig;

  constructor(config: Partial<NotebookLmCliConfig> = {}) {
    this.config = notebookLmCliConfig(config);
  }

  async run(args: readonly string[]): Promise<unknown> {
    try {
      await access(this.config.storagePath, constants.R_OK);
      if (!(await stat(this.config.storagePath)).isFile()) throw new Error();
    } catch {
      throw backendFailure('AUTH_REQUIRED');
    }
    // Explicit storage/web backend avoids active notebook/profile/backend context.
    // Disable inherited debug/inline-auth settings; credentials are consumed from file only.
    const env: NodeJS.ProcessEnv = { ...process.env, NOTEBOOKLM_DEBUG_RPC: '0', NOTEBOOKLM_LOG_LEVEL: 'ERROR' };
    delete env.NOTEBOOKLM_AUTH_JSON;
    return new Promise<unknown>((resolve, reject) => {
      execFile(this.config.executable,
        ['--storage', this.config.storagePath, '--backend', 'web', '--quiet', ...args],
        { encoding: 'utf8', timeout: this.config.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, env, shell: false },
        (error, stdout, stderr) => {
          // execFile reports killed=true only after its timeout terminates the child.
          if (error?.killed) {
            reject(new ClientError('NOTEBOOKLM_TIMEOUT', 'NotebookLM CLI timed out. Inspect the target notebook before repeating a write.'));
            return;
          }
          if (error && ['ENOENT', 'EACCES', 'ENOEXEC'].includes(String(error.code))) {
            reject(new ClientError('NOTEBOOKLM_CONFIG_INVALID', 'NotebookLM CLI cannot be started; check NOTEBOOKLM_CLI_PATH and executable permissions.'));
            return;
          }
          let payload: unknown;
          try { payload = JSON.parse(stdout) as unknown; } catch { /* Classified below after process errors. */ }
          const data = record(payload);
          if (data && Object.hasOwn(data, 'error')) {
            reject(backendFailure(record(data.error)?.code ?? data.code));
          } else if (error) {
            // Text-only auth diagnostics are a fallback, not an exit-code assumption.
            if (/\bAUTH_REQUIRED\b|\bAUTH_ERROR\b|authentication (?:required|expired|failed)|not authenticated|run ['"]?notebooklm login/i.test(stderr.slice(0, 8192))) {
              reject(backendFailure('AUTH_REQUIRED'));
            } else {
              reject(new ClientError('NOTEBOOKLM_PROCESS_ERROR', 'NotebookLM CLI failed to execute or exited unsuccessfully. Inspect the target notebook before repeating a write.'));
            }
          } else if (payload === undefined) {
            reject(new ClientError('NOTEBOOKLM_INVALID_RESPONSE', 'NotebookLM CLI returned invalid JSON.'));
          } else {
            resolve(payload);
          }
        });
    }).catch((error: unknown) => {
      if (error instanceof ClientError) throw error;
      throw new ClientError('NOTEBOOKLM_PROCESS_ERROR', 'NotebookLM CLI could not be executed.');
    });
  }
}
