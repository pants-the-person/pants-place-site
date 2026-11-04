import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  projectRoot,
  wineRoot,
  publicWineRoot,
  generatedRoot,
  stampPath,
  lockPath,
} from './config.mjs';
import { syncRuntime } from './sync-runtime.mjs';

function submoduleCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wineRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const required = [
  path.join(publicWineRoot, 'index.html'),
  path.join(publicWineRoot, 'embed.js'),
  path.join(publicWineRoot, 'embed.css'),
  path.join(publicWineRoot, 'build/wine-assembly.wasm'),
  path.join(publicWineRoot, 'build/wine-assembly.compat.wasm'),
  path.join(publicWineRoot, 'apps.manifest.json'),
  path.join(generatedRoot, 'wine-apps.ts'),
  path.join(publicWineRoot, 'binaries'),
  path.join(publicWineRoot, 'test/binaries'),
  path.join(publicWineRoot, 'packages'),
  lockPath,
];

const runtimeSources = [
  path.join(projectRoot, 'src/wine/embed.js'),
  path.join(projectRoot, 'src/wine/embed.css'),
  path.join(wineRoot, 'index.html'),
];
const runtimeTargets = [
  path.join(publicWineRoot, 'embed.js'),
  path.join(publicWineRoot, 'embed.css'),
  path.join(publicWineRoot, 'index.html'),
];
const runtimeChanged =
  fs.existsSync(path.join(publicWineRoot, 'index.html')) &&
  runtimeSources.some((source, index) => {
    try {
      return fs.statSync(source).mtimeMs > fs.statSync(runtimeTargets[index]).mtimeMs + 1;
    } catch {
      return true;
    }
  });
if (runtimeChanged) {
  console.log('Refreshing Wine-Assembly runtime files...');
  syncRuntime();
}

let currentStamp = null;
try {
  currentStamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
} catch {
  currentStamp = null;
}

const missing = required.filter((item) => !fs.existsSync(item));
const stale = currentStamp && currentStamp.commit !== submoduleCommit();

if (missing.length || stale) {
  console.log(
    missing.length
      ? `Preparing Wine-Assembly (missing ${missing.length} generated path${missing.length === 1 ? '' : 's'})...`
      : 'Preparing Wine-Assembly (submodule changed)...',
  );
  execFileSync(process.execPath, [path.join(projectRoot, 'scripts/wine/prepare.mjs')], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}
