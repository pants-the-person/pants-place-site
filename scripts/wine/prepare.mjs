import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  projectRoot,
  wineRoot,
  publicWineRoot,
  stampPath,
} from './config.mjs';
import { syncRuntime } from './sync-runtime.mjs';
import { syncAssets } from './sync-assets.mjs';

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function ensureSubmodule() {
  if (fs.existsSync(path.join(wineRoot, 'lib/apps.js'))) return;
  run('git', ['submodule', 'update', '--init', '--recursive'], { cwd: projectRoot });
}

function ensureDeps() {
  if (fs.existsSync(path.join(wineRoot, 'node_modules/wabt'))) return;
  run('npm', ['ci', '--omit=dev', '--ignore-scripts'], { cwd: wineRoot });
}

function buildWasm() {
  fs.mkdirSync(path.join(wineRoot, 'build'), { recursive: true });
  run(process.execPath, ['tools/concat-wat.js'], { cwd: wineRoot });
  run(process.execPath, ['tools/build-compile-wat.js'], { cwd: wineRoot });
}

function submoduleCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wineRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export async function prepareWine() {
  ensureSubmodule();
  ensureDeps();
  buildWasm();
  const runtime = syncRuntime();
  await syncAssets();
  run(process.execPath, [path.join(projectRoot, 'scripts/wine/gen-registry.mjs')], {
    cwd: projectRoot,
  });

  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(
    stampPath,
    JSON.stringify({
      commit: runtime.commit || submoduleCommit(),
      completedAt: new Date().toISOString(),
    }, null, 2) + '\n',
  );
  console.log(`Wine runtime ready at ${publicWineRoot}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareWine().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
