import fs from 'node:fs';
import path from 'node:path';
import { publicWineRoot, lockPath, excludedApps } from './config.mjs';

const errors = [];
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

for (const [rel, info] of Object.entries(lock.files)) {
  const full = path.join(publicWineRoot, rel);
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size;
    if (size !== info.size) errors.push(`${rel}: ${size} bytes, expected ${info.size}`);
    if (size > 25 * 1024 * 1024) errors.push(`${rel}: exceeds the 25 MiB static-asset limit`);
    continue;
  }
  let total = 0;
  let found = false;
  for (let index = 0; ; index++) {
    const part = `${full}.part${String(index).padStart(3, '0')}`;
    if (!fs.existsSync(part)) break;
    found = true;
    const size = fs.statSync(part).size;
    if (size > 25 * 1024 * 1024) errors.push(`${part}: exceeds the 25 MiB static-asset limit`);
    total += size;
  }
  if (!found) errors.push(`${rel}: missing`);
  else if (total !== info.size) errors.push(`${rel}: parts total ${total}, expected ${info.size}`);
}

for (const id of excludedApps) {
  if (lock.apps[id]) errors.push(`${id}: excluded app still present in the mirror`);
}

for (const file of ['index.html', 'host.js', 'build/wine-assembly.wasm', 'build/wine-assembly.compat.wasm', 'src/api_table.json']) {
  if (!fs.existsSync(path.join(publicWineRoot, file))) errors.push(`runtime file missing: ${file}`);
}

if (errors.length) {
  console.error('Wine verification failed:\n' + errors.slice(0, 40).join('\n'));
  if (errors.length > 40) console.error(`... and ${errors.length - 40} more`);
  process.exit(1);
}
console.log(`Wine verification passed: ${Object.keys(lock.files).length} assets.`);
