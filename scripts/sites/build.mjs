import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sitesRoot = path.join(root, 'sites');
const publicWebRoot = path.join(root, 'public/web');
const cacheRoot = path.join(root, '.cache/sites');
const generatedFile = path.join(root, 'src/generated/personal-sites.ts');
const force = process.argv.includes('--force');
const allowMissing = process.argv.includes('--allow-missing');
const metadataOnly = process.argv.includes('--metadata-only');
const WEB_ORIGIN = 'http://www.pants.place';

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.xml',
  '.svg',
  '.txt',
  '.webmanifest',
]);

function log(message) {
  console.log(`[sites] ${message}`);
}

function warn(message) {
  console.warn(`[sites] ${message}`);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function git(cwd, args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeIfChanged(file, content) {
  const previous = readText(file);
  if (previous === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function hashFile(file) {
  try {
    return hash(fs.readFileSync(file));
  } catch {
    return '';
  }
}

function prettify(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function submodulePaths() {
  const text = readText(path.join(root, '.gitmodules'));
  return [...text.matchAll(/^\s*path\s*=\s*(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((value) => value.startsWith('sites/'));
}

function ensureSubmodules() {
  const missing = submodulePaths().filter(
    (relative) => !fs.existsSync(path.join(root, relative, 'package.json')),
  );
  if (!missing.length) return;
  log(`initializing ${missing.length} site submodule${missing.length === 1 ? '' : 's'}`);
  run('git', ['submodule', 'update', '--init', '--recursive', ...missing], { cwd: root });
}

function discoverSites() {
  if (!fs.existsSync(sitesRoot)) return [];
  const sites = [];
  for (const kindEntry of fs.readdirSync(sitesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!kindEntry.isDirectory() || kindEntry.name.startsWith('.')) continue;
    const kind = kindEntry.name;
    const kindRoot = path.join(sitesRoot, kind);
    for (const siteEntry of fs.readdirSync(kindRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!siteEntry.isDirectory() || siteEntry.name.startsWith('.') || siteEntry.name.startsWith('_')) continue;
      const dir = path.join(kindRoot, siteEntry.name);
      const pkg = readJson(path.join(dir, 'package.json'));
      if (!pkg) {
        if (allowMissing) {
          warn(`skipping ${kind}/${siteEntry.name}: no package.json`);
          continue;
        }
        throw new Error(`Site ${kind}/${siteEntry.name} has no package.json. Run git submodule update --init --recursive.`);
      }
      const astro = readText(path.join(dir, 'astro.config.mjs'));
      const repoName = pkg.name || `site-${kind}-${siteEntry.name}`;
      const sourceBase = (/base\s*:\s*["']([^"']+)["']/.exec(astro)?.[1] || `/${repoName}`).replace(/\/+$/, '');
      const origin = (/site\s*:\s*["']([^"']+)["']/.exec(astro)?.[1] || 'https://pants-the-person.github.io').replace(/\/+$/, '');
      const config = readText(path.join(dir, 'src/site.config.ts'));
      const configField = (name) => {
        const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(config);
        if (!match) return '';
        try {
          return JSON.parse(`"${match[1]}"`);
        } catch {
          return match[1];
        }
      };
      const slug = siteEntry.name;
      sites.push({
        kind,
        slug,
        dir,
        pkg,
        repoName,
        sourceBase,
        origin,
        contentPath: `/web/${kind}/${slug}/`,
        launcherPath: `/${kind}/${slug}`,
        address: `${WEB_ORIGIN}/${kind}/${slug}/`,
        title: configField('title') || configField('displayName') || prettify(slug),
        description: configField('description') || `${prettify(slug)} on PantsNet.`,
        displayName: configField('displayName') || prettify(slug),
        handle: configField('handle') || slug,
      });
    }
  }
  return sites;
}

function makeRewriteMap(sites) {
  const pairs = [];
  for (const site of sites) {
    const target = site.contentPath.replace(/\/+$/, '');
    pairs.push([site.sourceBase, target]);
    for (const origin of new Set([site.origin, 'https://pants-the-person.github.io', 'http://pants-the-person.github.io'])) {
      pairs.push([`${origin}${site.sourceBase}`, target]);
      pairs.push([`${origin}${site.sourceBase}/`, `${target}/`]);
    }
  }
  // Longest literal first so /site-a does not rewrite /site-a-longer.
  return [...new Map(pairs).entries()].sort((a, b) => b[0].length - a[0].length);
}

function walkFiles(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, relative));
      continue;
    }
    if (entry.isFile()) files.push({ full, relative });
  }
  return files;
}

function copyTree(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const file of walkFiles(source)) {
    const destination = path.join(target, file.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file.full, destination);
  }
}

function stripScripts(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '#');
}

function rewriteFile(file, rewriteMap) {
  if (!TEXT_EXTENSIONS.has(path.extname(file.full).toLowerCase())) return { changed: false, stripped: 0 };
  let text = fs.readFileSync(file.full, 'utf8');
  const original = text;
  for (const [from, to] of rewriteMap) {
    if (!from || !text.includes(from)) continue;
    text = text.split(from).join(to);
  }
  text = text.replace(/\s+target=("_blank"|'_blank')/gi, '');
  const isMarkup = /\.(html?|svg)$/i.test(file.full);
  let stripped = 0;
  if (isMarkup) {
    const before = (text.match(/<script\b/gi) || []).length;
    text = stripScripts(text);
    const after = (text.match(/<script\b/gi) || []).length;
    stripped = Math.max(0, before - after);
  }
  if (text !== original) fs.writeFileSync(file.full, text);
  return { changed: text !== original, stripped };
}

function validateOutput(target, site) {
  const problems = [];
  for (const file of walkFiles(target)) {
    if (!/\.html?$/i.test(file.full)) continue;
    const html = fs.readFileSync(file.full, 'utf8');
    if (/<script\b/i.test(html)) problems.push(`${file.relative}: script tag remains`);
    const rootAbsolute = [...html.matchAll(/(?:href|src|action)=["'](\/[^"']*)["']/gi)]
      .map((match) => match[1])
      .filter((url) => !url.startsWith(site.contentPath) && !url.startsWith('/web/') && !url.startsWith('/media/') && !url.startsWith('/icons/') && !url.startsWith('/api/'));
    if (rootAbsolute.length) {
      warn(`${site.kind}/${site.slug}/${file.relative}: root-absolute URL ${rootAbsolute[0]}`);
    }
  }
  if (problems.length) throw new Error(`${site.kind}/${site.slug}: ${problems[0]}`);
}

function installStamp(dir) {
  return path.join(dir, 'node_modules', '.pants-place-install');
}

function ensureDependencies(site) {
  const lock = path.join(site.dir, 'package-lock.json');
  const lockHash = hashFile(lock);
  const stamp = installStamp(site.dir);
  const current = readText(stamp);
  if (fs.existsSync(path.join(site.dir, 'node_modules')) && current === lockHash) return;
  log(`${site.kind}/${site.slug}: installing dependencies`);
  if (fs.existsSync(lock)) {
    run('npm', ['ci'], { cwd: site.dir });
  } else {
    run('npm', ['install'], { cwd: site.dir });
  }
  fs.writeFileSync(stamp, lockHash);
}

function siteStamp(site) {
  const commit = git(site.dir, ['rev-parse', 'HEAD']);
  const status = git(site.dir, ['status', '--porcelain', '--untracked-files=normal']);
  const lockHash = hashFile(path.join(site.dir, 'package-lock.json'));
  const pkgHash = hashFile(path.join(site.dir, 'package.json'));
  return hash(JSON.stringify({
    commit,
    status,
    lockHash,
    pkgHash,
    sourceBase: site.sourceBase,
    contentPath: site.contentPath,
    version: 2,
  }));
}

function stampFile(site) {
  return path.join(cacheRoot, site.kind, `${site.slug}.json`);
}

function buildSite(site) {
  const output = path.join(site.dir, 'dist');
  const target = path.join(publicWebRoot, site.kind, site.slug);
  const stamp = siteStamp(site);
  const previous = readJson(stampFile(site));
  if (!force && previous?.stamp === stamp && fs.existsSync(path.join(target, 'index.html'))) {
    log(`${site.kind}/${site.slug}: up to date`);
    return;
  }

  ensureDependencies(site);
  log(`${site.kind}/${site.slug}: building`);
  run('npm', ['run', 'build'], {
    cwd: site.dir,
    env: {
      ...process.env,
      PANTS_SITE_BASE: site.contentPath,
      PANTS_SITE_CONTENT_PATH: site.contentPath,
    },
  });

  if (!fs.existsSync(path.join(output, 'index.html'))) {
    throw new Error(`${site.kind}/${site.slug}: build did not produce dist/index.html`);
  }

  copyTree(output, target);
  fs.mkdirSync(path.dirname(stampFile(site)), { recursive: true });
  fs.writeFileSync(stampFile(site), JSON.stringify({ stamp, builtAt: new Date().toISOString() }, null, 2) + '\n');
}

function writeRegistry(sites) {
  const entries = sites.map((site) => ({
    kind: site.kind,
    slug: site.slug,
    repo: site.repoName,
    handle: site.handle,
    displayName: site.displayName,
    title: site.title,
    description: site.description,
    launcherPath: site.launcherPath,
    contentPath: site.contentPath,
    address: site.address,
    favorite: FAVORITE_SITES.has(`${site.kind}/${site.slug}`),
  }));
  const body = `// Generated by scripts/sites/build.mjs. Do not edit.
export interface GeneratedPersonalSite {
  kind: string;
  slug: string;
  repo: string;
  handle: string;
  displayName: string;
  title: string;
  description: string;
  launcherPath: string;
  contentPath: string;
  address: string;
  favorite: boolean;
}

export const personalSites: GeneratedPersonalSite[] = ${JSON.stringify(entries, null, 2)};
`;
  if (writeIfChanged(generatedFile, body)) log(`wrote ${path.relative(root, generatedFile)}`);
}

const KIND_ORDER = new Map([
  ['member', 0],
  ['char', 1],
]);

/** Keep the IE Links bar and Start > Favorites menu curated. */
const FAVORITE_SITES = new Set(['member/pants', 'member/kylie', 'member/shades']);

function main() {
  ensureSubmodules();
  const sites = discoverSites().sort((a, b) => {
    const kind = (KIND_ORDER.get(a.kind) ?? 9) - (KIND_ORDER.get(b.kind) ?? 9);
    return kind || a.slug.localeCompare(b.slug);
  });
  if (!sites.length) warn('no sites found under sites/*/*');
  if (metadataOnly) {
    writeRegistry(sites);
    log(`metadata ready: ${sites.length} personal site${sites.length === 1 ? '' : 's'}`);
    return;
  }
  const rewriteMap = makeRewriteMap(sites);
  for (const site of sites) {
    buildSite(site);
    const target = path.join(publicWebRoot, site.kind, site.slug);
    let stripped = 0;
    for (const file of walkFiles(target)) {
      stripped += rewriteFile(file, rewriteMap).stripped;
    }
    if (stripped) log(`${site.kind}/${site.slug}: removed ${stripped} script block${stripped === 1 ? '' : 's'}`);
    validateOutput(target, site);
  }
  writeRegistry(sites);
  log(`ready: ${sites.length} personal site${sites.length === 1 ? '' : 's'}`);
}

try {
  main();
} catch (error) {
  console.error(`[sites] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
