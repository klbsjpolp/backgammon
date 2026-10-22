// Moves every member of a lockstep group in the pnpm catalog up to the newest
// version any member is at. Dependabot bumps one catalog entry per PR and
// leaves its siblings behind, which `pnpm peers check` then rejects; this is
// what the align-catalog workflow runs on its PRs to finish the job.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'pnpm-workspace.yaml';

// Each group ships as one release and names its members at their own exact
// version. A new group here also needs its members declared in the catalog.
const GROUPS = [
  ['vitest', '@vitest/coverage-v8'],
  ['typescript-eslint', '@typescript-eslint/eslint-plugin', '@typescript-eslint/parser'],
];

const parse = (version) => {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${version} is not an exact x.y.z version`);
  return version.split('.').map(Number);
};

const newer = (a, b) => {
  const [pa, pb] = [parse(a), parse(b)];
  const i = pa.findIndex((n, k) => n !== pb[k]);
  return i !== -1 && pa[i] > pb[i];
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const entry = (name) => new RegExp(`^(  '?${escape(name)}'?: )(\\S+)$`, 'm');

let text = readFileSync(FILE, 'utf8');
const changes = [];

for (const group of GROUPS) {
  const versions = group.map((name) => {
    const match = text.match(entry(name));
    // A member missing from the catalog would be resolved on its own and drift
    // silently, which is the failure this script exists to prevent.
    if (!match) throw new Error(`${name} is not in the catalog of ${FILE}`);
    return match[2];
  });
  const target = versions.reduce((best, v) => (newer(v, best) ? v : best));
  group.forEach((name, i) => {
    if (versions[i] === target) return;
    text = text.replace(entry(name), `$1${target}`);
    changes.push(`${name} ${versions[i]} -> ${target}`);
  });
}

if (changes.length > 0) {
  writeFileSync(FILE, text);
  console.info(changes.join('\n'));
} else {
  console.info('Catalog groups already aligned.');
}
