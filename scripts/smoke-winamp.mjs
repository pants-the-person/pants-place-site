import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const sample = process.env.WINAMP_SAMPLE || 'public/media/chiptune-c64.ogg';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  try {
    sessionStorage.setItem('pp98:booted', '1');
    sessionStorage.setItem('pp98:welcome', '1');
  } catch {}
});
const page = await context.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('404')) {
    failures.push(`console: ${message.text()}`);
  }
});

function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(name);
}

await page.goto(`${base}/?boot=1`, { waitUntil: 'networkidle' });
await page.mouse.click(10, 10);
await page.waitForTimeout(500);

// Native Winamp opens stopped.
await page.locator('.desktop-icon', { hasText: 'Winamp' }).dblclick();
await page.waitForSelector('.wa-main');
await page.waitForTimeout(400);
check('main window is 275x116', (await page.locator('.wa-main').boundingBox())?.width === 275);
check('nothing auto-played', (await page.locator('.wa-pl-row.playing').count()) === 0);

await page.getByTitle('Playlist').click();
await page.waitForSelector('.wa-playlist');
await page.getByTitle('Equalizer').click();
await page.waitForSelector('.wa-eq');
await page.waitForTimeout(250);
const main = await page.locator('.wa-main').boundingBox();
const eq = await page.locator('.wa-eq').boundingBox();
const playlist = await page.locator('.wa-playlist').boundingBox();
check('equalizer is 275x116', eq?.width === 275 && eq?.height === 116);
check('playlist is 275x232', playlist?.width === 275 && playlist?.height === 232);
check('panels are stacked below the main window', Boolean(main && eq && playlist && eq.y >= main.y + main.height && playlist.y >= eq.y + eq.height));

const before = await page.locator('.wa-pl-row').count();
await page.locator('.wa-playlist input[type=file]').setInputFiles(sample);
await page.waitForTimeout(500);
check('ADD adds a track to the queue', (await page.locator('.wa-pl-row').count()) === before + 1);

// Play an explicit row and confirm the playlist marks it as current.
await page.locator('.wa-pl-row').first().click();
await page.locator('.wa-pl-mini-transport button').nth(1).click();
await page.waitForTimeout(1200);
check('explicit play selects a current track', (await page.locator('.wa-pl-row.playing').count()) === 1);

await page.screenshot({ path: '/tmp/opencode/winamp-smoke.png' });

// Explorer drives.
await page.locator('.desktop-icon', { hasText: 'My Computer' }).dblclick();
await page.waitForSelector('.explorer-grid');
const rootItems = await page.locator('.explorer-item').allTextContents();
check('My Computer shows A:, C: and D:', ['3½ Floppy (A:)', 'Win98 (C:)', 'PantsNet (D:)'].every((name) => rootItems.includes(name)));

await page.locator('.explorer-item', { hasText: 'Win98 (C:)' }).dblclick();
await page.waitForTimeout(400);
check('C: navigates to its root', (await page.locator('input.field').first().inputValue()) === 'C:\\');
const cItems = await page.locator('.explorer-item').allTextContents();
check('C: has the full mock tree', ['Windows', 'Program Files', 'My Documents', 'AUTOEXEC.BAT'].every((name) => cItems.includes(name)));

await page.locator('.explorer-item', { hasText: 'Windows' }).dblclick();
await page.waitForTimeout(300);
check('C:\\Windows opens', (await page.locator('input.field').first().inputValue()) === 'C:\\Windows');

await page.locator('.toolbar button').nth(1).click();
await page.waitForTimeout(200);
await page.locator('.toolbar button').nth(1).click();
await page.waitForTimeout(500);
await page.locator('.explorer-item', { hasText: '3½ Floppy (A:)' }).dblclick();
await page.waitForTimeout(1800);
check('A: navigates to its root', (await page.locator('input.field').first().inputValue()) === 'A:\\');
const aItems = await page.locator('.explorer-item').allTextContents();
check('A: lists the FreeDOS floppy', aItems.includes('KERNEL.SYS') || aItems.includes('FDOS'));

await page.screenshot({ path: '/tmp/opencode/drives-smoke.png' });

console.log('');
console.log(failures.length ? `${failures.length} failure(s)` : 'Winamp and drive smoke passed.');
await browser.close();
process.exit(failures.length ? 1 : 0);
