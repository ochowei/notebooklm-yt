import { ClientError } from '../../application/errors.js';

interface NotebookDto { readonly id: string; readonly title?: string }
interface SourceDto { readonly id: string }

function invalid(): never {
  throw new ClientError('NOTEBOOKLM_INVALID_RESPONSE', 'NotebookLM CLI response does not match the expected contract.');
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}
function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  if (!Object.hasOwn(data, key)) return undefined;
  if (typeof data[key] !== 'string') invalid();
  return data[key];
}
function envelope(value: unknown): Record<string, unknown> {
  const data = object(value);
  if (Object.hasOwn(data, 'error')) {
    throw new ClientError('NOTEBOOKLM_BACKEND_ERROR', 'NotebookLM returned an error envelope.');
  }
  return data;
}
export function parseNotebook(value: unknown): NotebookDto {
  const data = object(envelope(value).notebook);
  return { id: id(data.id), title: optionalString(data, 'title') };
}
export function parseYouTubeSource(value: unknown, notebookId: string): SourceDto {
  const root = envelope(value);
  const data = object(root.source);
  for (const item of [root, data]) {
    if (Object.hasOwn(item, 'notebook_id') && id(item.notebook_id) !== notebookId) invalid();
  }
  const type = optionalString(data, 'type');
  if (type !== undefined && type !== 'youtube') invalid();
  const status = optionalString(data, 'status');
  if (status !== undefined && !['ready', 'processing', 'pending', 'error'].includes(status)) invalid();
  if (status === 'error') throw new ClientError('NOTEBOOKLM_BACKEND_ERROR', 'NotebookLM reported source processing failure.');
  return { id: id(data.id) };
}
