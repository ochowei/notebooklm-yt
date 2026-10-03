import type { Notebook, NotebookSource } from '../domain/notebook.js';

/** Notebook operations independent of a particular SDK or authentication method. */
export interface NotebookProvider {
  createNotebook(title: string): Promise<Notebook>;
  addYouTubeSource(notebookId: string, url: string): Promise<NotebookSource>;
}
