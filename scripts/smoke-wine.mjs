import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const all = process.argv.includes('--all');

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  sessionStorage.setItem('pp98:booted', '1');
  sessionStorage.setItem('pp98:welcome', '1');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function openDesktop() {
  await page.goto(`${base}/?boot=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.mouse.click(10, 10);
  await page.waitForTimeout(400);
}

async function openLauncher() {
  await page.locator('.start-button').click();
  await page.locator('.start-item', { hasText: 'Programs' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('.start-item', { hasText: 'Wine-Assembly' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('.start-item', { hasText: 'All Wine Programs' }).click();
  await page.waitForTimeout(500);
}

async function launch(id, wait = 8000) {
  await page.locator(`[data-wine-app="${id}"]`).dblclick();
  await page.waitForTimeout(wait);
}

function wineFrame(id) {
  return page.frames().find((frame) => frame.url().includes('app=' + id));
}

async function launchWineMenu(label) {
  await page.locator('.start-button').click();
  await page.locator('.start-item', { hasText: 'Programs' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('.start-item', { hasText: 'Wine-Assembly' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('.start-item', { hasText: label }).first().click();
}

await openDesktop();
await openLauncher();
const count = await page.locator('[data-wine-app]').count();
if (count !== 41) throw new Error(`expected 41 Wine programs, found ${count}`);

await launch('pinball', 9000);
await openLauncher();
await launch('sol', 9000);

const frames = page.locator('.wine-frame');
if ((await frames.count()) !== 2) throw new Error('expected two Wine windows');
const pinball = wineFrame('pinball');
const sol = wineFrame('sol');
if (!pinball || !sol) throw new Error('missing Wine iframe');
if (!(await pinball.locator('#status').textContent()).includes('Running')) {
  throw new Error('Pinball did not reach Running');
}
if (!(await sol.locator('#status').textContent()).includes('Running')) {
  throw new Error('Solitaire did not reach Running');
}

// Drop a small freeware executable through Explorer's file picker.
await page.locator('.win98-window', { hasText: 'My Computer' }).count();
await openDesktop();
await page.locator('.desktop-icon', { hasText: 'My Computer' }).dblclick();
await page.waitForTimeout(700);
await page.locator('input[type=file]').first().setInputFiles('public/wine/binaries/entertainment-pack/ski32.exe');
await page.waitForTimeout(12000);
if ((await page.locator('.wine-frame').count()) !== 1) throw new Error('dropped .exe did not open a Wine window');
const dropped = page.frames().find((frame) => frame.url().includes('drop=1'));
if (!dropped || !(await dropped.locator('#status').textContent()).includes('Running')) {
  throw new Error('dropped .exe did not reach Running');
}

// FreeDOS isolation: typing into Wine must not reach an active terminal.
await openDesktop();
await page.locator('.desktop-icon', { hasText: 'MS-DOS Prompt' }).dblclick();
await page.waitForTimeout(6000);
await page.mouse.click(200, 200);
await page.keyboard.type('echo TERM');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const before = await page.locator('.dos-text').textContent();
if (!before.includes('TERM')) throw new Error('terminal did not receive focus');

await launchWineMenu('Pinball');
await page.waitForTimeout(11000);
const wineWindow = page.locator('.win98-window', { has: page.locator('.wine-frame') }).last();
const box = await wineWindow.boundingBox();
if (box) await page.mouse.click(box.x + box.width - 30, box.y + 200);
const frame = page.frames().find((item) => item.url().includes('app=pinball'));
if (frame) await frame.locator('#screen').click({ position: { x: 300, y: 300 } }).catch(() => {});
await page.keyboard.type('echo WINE');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
const after = await page.locator('.dos-text').textContent();
if (after !== before) throw new Error('Wine keyboard input leaked into the FreeDOS terminal');

if (all) {
  const manifest = await page.evaluate(async () => (await fetch('/wine/apps.manifest.json')).json());
  for (const id of Object.keys(manifest.apps)) {
    await openDesktop();
    await openLauncher();
    await launch(id, 9000);
    const target = wineFrame(id);
    const status = target ? await target.locator('#status').textContent() : '';
    if (!status.includes('Running')) throw new Error(`${id} did not reach Running`);
  }
}

if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`);
console.log('Wine smoke passed.');
await browser.close();
