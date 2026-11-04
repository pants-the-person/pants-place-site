import path from 'node:path';
import { createRequire } from 'node:module';
import { wineRoot, excludedApps } from './config.mjs';

const require = createRequire(import.meta.url);

export function loadWineApps() {
  const sizesPath = path.join(wineRoot, 'lib/app-file-sizes.generated.js');
  let sizes = {};
  try {
    sizes = require(sizesPath);
  } catch {
    sizes = {};
  }
  globalThis.window = { wineAppFileSizes: sizes };
  const appsPath = path.join(wineRoot, 'lib/apps.js');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(wineRoot)) delete require.cache[key];
  }
  return require(appsPath);
}

export function loadHelpers() {
  return {
    dlls: require(path.join(wineRoot, 'lib/dll-registry.js')),
    dllLoader: require(path.join(wineRoot, 'lib/dll-loader.js')),
    vfsSeed: require(path.join(wineRoot, 'lib/vfs-seed.js')),
  };
}

export function desktopAppIds(mod) {
  return mod.DESKTOP_APPS.map(([id]) => id).filter((id) => !excludedApps.has(id));
}

export function appLabel(mod, id) {
  const row = mod.DESKTOP_APPS.find(([appId]) => appId === id);
  return row ? row[1] : id;
}
