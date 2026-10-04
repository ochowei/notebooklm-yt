import { render } from 'ink';
import { App } from './App.js';
import type { AppProps } from './App.js';

export async function startTui(props: AppProps): Promise<void> {
  const app = render(<App {...props} />);
  await app.waitUntilExit();
}
