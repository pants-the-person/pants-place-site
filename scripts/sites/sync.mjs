import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const merge = process.argv.includes('--merge');

function siteSubmodulePaths() {
  const text = (() => {
    try {
      return fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
    } catch {
      return '';
    }
  })();
  return [...new Set(
    [...text.matchAll(/^\s*path\s*=\s*(.+)$/gm)]
      .map((match) => match[1].trim())
      .filter((value) => value.startsWith('sites/')),
  )].sort();
}

const paths = siteSubmodulePaths();
if (!paths.length) {
  console.log('[sites] no personal-site submodules configured');
  process.exit(0);
}

console.log(`[sites] updating ${paths.length} submodule${paths.length === 1 ? '' : 's'} from remote`);
execFileSync(
  'git',
  ['submodule', 'update', '--init', '--remote', ...(merge ? ['--merge'] : []), ...paths],
  { cwd: root, stdio: 'inherit' },
);
