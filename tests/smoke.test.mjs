import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

test('compiled CLI starts and describes the scaffold', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });

  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /QueryTube → notebooklm-yt → NotebookLM/);
  assert.match(result.stdout, /not implemented yet/);
  assert.equal(result.stderr, '');
});

test('CLI rejects an import command that is not implemented', () => {
  const result = spawnSync(process.execPath, [cliPath, 'import'], { encoding: 'utf8' });

  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not implemented yet/);
});
