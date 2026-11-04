import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const out = '/tmp/opencode/shots';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  try {
    sessionStorage.setItem('pp98:booted', '1');
    sessionStorage.setItem('pp98:welcome', '1');
  } catch {}
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(`${base}/?boot=1`, { waitUntil: 'networkidle' });
await page.mouse.click(10, 10);
await page.waitForTimeout(500);

// Calculator
await page.locator('.start-button').click();
await page.locator('.start-item', { hasText: 'Programs' }).first().click();
await page.locator('.start-item', { hasText: 'Accessories' }).first().click();
await page.locator('.start-item', { hasText: 'Calculator' }).first().click();
await page.waitForSelector('.calc');
await page.getByRole('button', { name: '2', exact: true }).click();
await page.getByRole('button', { name: '+', exact: true }).click();
await page.getByRole('button', { name: '3', exact: true }).click();
await page.getByRole('button', { name: '=', exact: true }).click();
console.log('CALC:', await page.locator('.calc-display').textContent());
await page.screenshot({ path: `${out}/calc.png` });
await page.locator('.win98-window', { hasText: 'Calculator' }).locator('[data-action="close"]').click();

// Minesweeper
await page.locator('.desktop-icon', { hasText: 'Minesweeper' }).dblclick();
await page.waitForSelector('.minesweeper');
await page.locator('.mine-cell').nth(40).click();
await page.waitForTimeout(300);
console.log('MINES REVEALED:', await page.locator('.mine-cell.revealed').count());
await page.locator('.mine-cell:not(.revealed)').first().click({ button: 'right' });
console.log('MINES FLAGS:', await page.locator('.mine-cell.flagged').count());
await page.screenshot({ path: `${out}/mines.png` });
await page.locator('.win98-window', { hasText: 'Minesweeper' }).locator('[data-action="close"]').click();

// Paint
await page.locator('.desktop-icon', { hasText: 'Notepad' }).dblclick();
await page.waitForSelector('textarea');
await page.locator('textarea').fill('Hello from Pants Place 98.\nThis is Notepad.');
await page.screenshot({ path: `${out}/notepad.png` });
await page.locator('.win98-window', { hasText: 'Notepad' }).locator('[data-action="close"]').click();

// Display properties
await page.locator('.desktop-icon', { hasText: 'My Computer' }).dblclick();
await page.waitForSelector('.explorer-grid');
await page.screenshot({ path: `${out}/explorer2.png` });
await page.locator('.win98-window', { hasText: 'My Computer' }).locator('[data-action="close"]').click();

// IE navigation
await page.locator('.desktop-icon', { hasText: 'Internet Explorer' }).dblclick();
await page.waitForSelector('iframe[title="Internet Explorer content"]');
await page.waitForTimeout(1500);
await page.locator('iframe[title="Internet Explorer content"]').contentFrame().getByRole('link', { name: 'NEWS', exact: true }).click();
await page.waitForTimeout(1200);
console.log('IE ADDRESS:', await page.locator('.win98-window', { hasText: 'Internet Explorer' }).locator('input.field').inputValue());
await page.locator('.win98-window', { hasText: 'Internet Explorer' }).getByTitle('Back').click();
await page.waitForTimeout(900);
console.log('IE BACK H1:', await page.locator('iframe[title="Internet Explorer content"]').contentFrame().locator('h1').first().textContent());
await page.screenshot({ path: `${out}/ie-news.png` });
await page.locator('.win98-window', { hasText: 'Internet Explorer' }).locator('[data-action="close"]').click();

// Winamp MIDI
await page.locator('.desktop-icon', { hasText: 'Winamp' }).dblclick();
await page.waitForSelector('.winamp');
await page.getByTitle('Playlist').click();
await page.waitForSelector('.winamp-playlist');
await page.locator('.playlist-row').nth(2).dblclick();
await page.waitForTimeout(3500);
console.log('MIDI TITLE:', (await page.locator('.lcd-title').textContent()).trim());
console.log('MIDI TIME:', await page.locator('.lcd-time').textContent());
await page.screenshot({ path: `${out}/winamp-midi2.png` });

// Settings
await page.locator('.desktop-icon', { hasText: 'My Computer' }).dblclick();
await page.waitForSelector('.explorer-grid');
await page.locator('.win98-window', { hasText: 'My Computer' }).locator('[data-action="close"]').click();

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');

// Guestbook and search in a new page
const web = await context.newPage();
await web.goto(`${base}/web/guestbook/`, { waitUntil: 'networkidle' });
await web.fill('input[name="name"]', 'test_user');
await web.fill('textarea[name="message"]', 'Testing the guestbook from Playwright.');
await web.click('button[type="submit"]');
await web.waitForTimeout(300);
console.log('GUESTBOOK:', await web.locator('.web-guestbook .entry').first().textContent());
const search = await context.newPage();
await search.goto(`${base}/web/search/?q=midi`, { waitUntil: 'networkidle' });
console.log('SEARCH RESULTS:', await search.locator('.web-results li').count());
await search.screenshot({ path: `${out}/search.png` });

// Mobile
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobile.addInitScript(() => {
  sessionStorage.setItem('pp98:booted', '1');
  sessionStorage.setItem('pp98:welcome', '1');
});
const mp = await mobile.newPage();
await mp.goto(`${base}/?boot=1`, { waitUntil: 'networkidle' });
await mp.mouse.click(10, 10);
await mp.waitForTimeout(500);
await mp.screenshot({ path: `${out}/mobile-desktop.png` });
await mp.locator('.desktop-icon', { hasText: 'MS-DOS Prompt' }).dblclick();
await mp.waitForTimeout(4000);
await mp.screenshot({ path: `${out}/mobile-terminal.png` });

await browser.close();
