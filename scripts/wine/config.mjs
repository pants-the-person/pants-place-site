import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '../..');
export const wineRoot = path.join(projectRoot, 'vendor/wine-assembly');
export const publicWineRoot = path.join(projectRoot, 'public/wine');
export const cacheRoot = path.join(projectRoot, '.cache/wine');
export const assetCacheRoot = path.join(cacheRoot, 'assets');
export const generatedRoot = path.join(projectRoot, 'src/generated');
export const lockPath = path.join(projectRoot, 'wine-assets.lock.json');
export const stampPath = path.join(cacheRoot, 'stamp.json');
export const liveBase = 'https://wine-assembly.berrry.app/';

// These three titles are the ones upstream itself says are published only at
// the site owner's discretion. Pants Place deliberately leaves them out.
export const excludedApps = new Set([
  'simcity2000_demo',
  'nfs2se_glide_demo',
  'nfs3_glide_demo',
  'moorhuhn',
  // Upstream lists Half-Life: Uplink on its desktop, but its installed payload
  // is not published (every asset 404s on the live host). Keep it out until
  // upstream ships the files.
  'halflife_uplink',
]);

export const featuredApps = ['pinball', 'sol', 'ski32', 'winmine_wep', 'winamp'];

export const categoryByApp = {
  notepad: 'accessories',
  calc: 'accessories',
  mspaint98: 'accessories',
  wordpad: 'accessories',
  regedit: 'system',
  taskman: 'system',
  sndrec32_98: 'accessories',
  winamp: 'accessories',
  screensavers: 'system',
  freecell: 'games',
  sol: 'games',
  cruel: 'games',
  golf: 'games',
  pegged: 'games',
  snake: 'games',
  wep16_rodent: 'games',
  wep16_jezzball: 'games',
  taipei: 'games',
  tictac: 'games',
  reversi: 'games',
  winmine_wep: 'games',
  ski32: 'games',
  pinball: 'games',
  spider: 'games',
  marbles: 'games',
  bricks: 'games',
  empipe: 'games',
  funtris: 'games',
  peaks: 'games',
  pyramid: 'games',
  fourstones: 'games',
  cwordzap: 'games',
  qblackjack: 'games',
  dxball: 'games',
  blobby_volley: 'games',
  starcraft_shareware: 'games',
  diablo_shareware: 'games',
  heroes2_demo: 'games',
  rct: 'games',
  quake2_demo: 'games',
  quake3_demo: 'games',
  halflife_uplink: 'games',
};

export function categoryOf(id) {
  return categoryByApp[id] || 'games';
}

export const defaultSizeByApp = {
  pinball: { w: 860, h: 660 },
  sol: { w: 720, h: 560 },
  ski32: { w: 720, h: 560 },
  winmine_wep: { w: 360, h: 430 },
  freecell: { w: 720, h: 560 },
  winamp: { w: 420, h: 300 },
  notepad: { w: 720, h: 520 },
  calc: { w: 320, h: 360 },
  mspaint98: { w: 760, h: 580 },
  wordpad: { w: 760, h: 560 },
  rct: { w: 900, h: 660 },
  quake2_demo: { w: 960, h: 700 },
  quake3_demo: { w: 960, h: 700 },
  halflife_uplink: { w: 960, h: 700 },
  starcraft_shareware: { w: 900, h: 660 },
  diablo_shareware: { w: 900, h: 660 },
};
