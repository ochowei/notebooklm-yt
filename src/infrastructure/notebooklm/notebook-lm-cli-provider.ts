import { ClientError } from '../../application/errors.js';
import type { NotebookProvider } from '../../application/notebook-provider.js';
import type { Notebook, NotebookSource } from '../../domain/notebook.js';
import { parseNotebook, parseYouTubeSource } from './contract.js';
import { NotebookLmCliRunner } from './notebook-lm-cli-runner.js';
import type { NotebookLmRunner } from './notebook-lm-cli-runner.js';

function input(value: string): void {
  if (!value.trim() || value.includes('\0')) {
    throw new ClientError('CLI_INVALID_ARGUMENTS', 'NotebookLM title, notebook ID, and URL must be nonempty strings without NUL characters.');
  }
}

export class NotebookLmCliProvider implements NotebookProvider {
  constructor(private readonly runner: NotebookLmRunner = new NotebookLmCliRunner()) {}

  async createNotebook(title: string): Promise<Notebook> {
    input(title);
    // -- ends option parsing so a title starting with '-' remains a title.
    const notebook = parseNotebook(await this.runner.run(['create', '--json', '--', title]));
    return { id: notebook.id, title: notebook.title ?? title };
  }

  async addYouTubeSource(notebookId: string, url: string): Promise<NotebookSource> {
    input(notebookId);
    input(url);
    const source = parseYouTubeSource(await this.runner.run([
      'source', 'add', '--notebook', notebookId, '--type', 'youtube', '--json', '--', url,
    ]), notebookId);
    return { id: source.id, url };
  }
}
