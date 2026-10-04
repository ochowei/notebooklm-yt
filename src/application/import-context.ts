import { randomInt } from 'node:crypto';
import { ClientError } from './errors.js';

export interface ImportContext {
  readonly importId: string;
  readonly createdAt: string;
  readonly notebookTitle: string;
}

export interface ImportContextDependencies {
  readonly clock: () => Date;
  readonly generateId: () => string;
}

/** Independent cryptographic samples: 36^6 possible IDs, with no persistent counter. */
export function generateImportId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return `NLYT-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')}`;
}

/** Capture the clock once; display local time while storing a full UTC timestamp. */
export function createImportContext(
  userTitle: string,
  dependencies: ImportContextDependencies,
): ImportContext {
  const now = dependencies.clock();
  const importId = dependencies.generateId();
  const pad = (value: number) => String(value).padStart(2, '0');
  const display = `${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return { importId, createdAt: now.toISOString(), notebookTitle: `${userTitle} [${display}] [${importId}]` };
}

/** Fatal attempts retain context and stable codes without publishing backend diagnostics. */
export class ImportSearchRunError extends ClientError {
  constructor(readonly context: ImportContext, error: unknown) {
    super(error instanceof ClientError ? error.code : 'INTERNAL_ERROR', 'Search Run import failed.');
    this.name = 'ImportSearchRunError';
    this.cause = error;
  }
}
