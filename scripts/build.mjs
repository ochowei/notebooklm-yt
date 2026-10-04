import { execFileSync } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
// Remove stale output so packaging only includes files from the current source.
rmSync(new URL('dist/', root), { recursive: true, force: true });
execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)),
  '-p', 'tsconfig.json'], { cwd: fileURLToPath(root), stdio: 'inherit' });
chmodSync(new URL('dist/cli/index.js', root), 0o755);
