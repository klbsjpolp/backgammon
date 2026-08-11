import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The workspace version — the one `commit-and-tag-version` bumps from the
 * conventional commits — spelled as the matching release tag. Read from disk at
 * config time so the bundle carries the version without the app importing
 * `package.json`.
 */
export const workspaceVersionTag = (): string => {
  const packageJson = readFileSync(path.resolve(dirname, '../../package.json'), 'utf8');
  return `v${(JSON.parse(packageJson) as { version: string }).version}`;
};
