import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'src/data/oldnet-webring.json');
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function text(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const members = new Map();
for (let page = 0; page < 45; page++) {
  const response = await fetch(`https://webring.theoldnet.com/?page=${page}`, {
    headers: { 'user-agent': userAgent },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`webring page ${page}: HTTP ${response.status}`);
  const html = await response.text();
  const pattern = /<a href="([^"]+)"><strong>([\s\S]*?)<\/strong><\/a><br>([\s\S]*?)(?=<br><hr \/>|<br>\s*<\/td>|<\/td>)/g;
  let match;
  while ((match = pattern.exec(html))) {
    const url = decodeEntities(match[1]).trim();
    const name = text(match[2]);
    const description = text(match[3]);
    if (!url || !name) continue;
    if (!members.has(url)) members.set(url, { name, url, description });
  }
  process.stdout.write(`\r${page + 1}/45 pages, ${members.size} members`);
}
process.stdout.write('\n');

const data = {
  source: 'https://webring.theoldnet.com/',
  members: [...members.values()],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${data.members.length} members to ${output}`);
