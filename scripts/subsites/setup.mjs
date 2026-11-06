#!/usr/bin/env node
/**
 * Convert one of the personal-site repositories into a standalone
 * assets-only Cloudflare Worker mounted under `/sites/<kind>/<slug>`.
 *
 * The parent site owns the public `/member/<slug>` and `/char/<slug>` deep
 * links, boots the desktop there, and loads this Worker inside IE.
 *
 * Usage:
 *   node scripts/subsites/setup.mjs --dir ../site-member-pants --kind member --slug pants
 *   node scripts/subsites/setup.mjs --dir ../site-char-chogi --kind char --slug chogi --github-workflow
 *
 * Run this from the parent pants-place-site checkout, pointing `--dir` at a
 * checkout of the subsite repository.
 */
import fs from 'node:fs';
import path from 'node:path';

const WRANGLER_PATH = 'wrangler.jsonc';
const LEGACY_WORKER_PATH = 'worker/index.js';
const WORKFLOW_PATH = '.github/workflows/deploy.yml';

const TEXT_EXTENSIONS = new Set(['.astro', '.ts', '.js', '.mjs', '.md', '.json', '.html']);

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error(`Usage:
  node scripts/subsites/setup.mjs --dir <subsite-checkout> --kind <member|char> --slug <slug> [--github-workflow]

Options:
  --dir               Path to a checkout of the subsite repository (required)
  --kind              member or char (required)
  --slug              URL slug, e.g. pants or chogi (required)
  --name              Cloudflare Worker name (default: pants-place-<kind>-<slug>)
  --github-workflow   Also write a GitHub Actions Cloudflare deploy workflow
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { githubWorkflow: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') args.dir = argv[++i];
    else if (arg === '--kind') args.kind = argv[++i];
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--github-workflow') args.githubWorkflow = true;
    else if (arg === '--help' || arg === '-h') usage();
    else usage(`Unknown argument: ${arg}`);
  }
  return args;
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeIfChanged(file, content) {
  if (read(file) === content) return false;
  write(file, content);
  return true;
}

function walk(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', '.astro'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(full, relative));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push({ full, relative });
  }
  return files;
}

function wranglerConfig({ kind, slug, name }) {
  const base = `/sites/${kind}/${slug}`;
  return `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${name}",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "assets": {
    "directory": "./dist",
    "base_path": "${base}",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  },
  "routes": [
    {
      "pattern": "pants.place${base}",
      "zone_name": "pants.place"
    },
    {
      "pattern": "pants.place${base}/*",
      "zone_name": "pants.place"
    }
  ]
}
`;
}

function workflow() {
  return `name: Deploy static Worker

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-\${{ github.repository }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version: 26
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy
        run: npx --yes wrangler@4 deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`;
}

function replaceConfigOption(config, name, value) {
  const pattern = new RegExp(`^\\s*${name}:\\s*.*$`, 'gm');
  const line = `  ${name}: ${value},`;
  let replaced = false;
  let next = config.replace(pattern, () => {
    if (replaced) return '';
    replaced = true;
    return line;
  });
  if (!replaced) {
    next = next.replace(/defineConfig\(\{/, `defineConfig({\n${line}`);
  }
  return next;
}

function patchAstroConfig(dir, base) {
  const candidates = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'];
  const file = candidates.map((name) => path.join(dir, name)).find((candidate) => fs.existsSync(candidate));
  if (!file) {
    console.warn('[subsites] no astro.config.* found; set the Astro base and outDir manually');
    return false;
  }
  let config = read(file);
  config = replaceConfigOption(config, 'site', '"https://pants.place"');
  config = replaceConfigOption(config, 'base', `process.env.PANTS_SITE_BASE || "${base}"`);
  config = replaceConfigOption(config, 'outDir', '"./dist"');
  return writeIfChanged(file, config);
}

function patchLinks(dir) {
  const legacy = /https?:\/\/pants-the-person\.github\.io\/site-(member|char)-([a-z0-9-]+)(\/[^\s"'<>)]*)?/g;
  // Also migrate links that an earlier run changed to the public deep-link
  // path. Inside the site, cross-site links must use the internal route.
  const localPublic = /https:\/\/pants\.place\/(member|char)\/([a-z0-9-]+)(\/[^\s"'<>)]*)?/g;
  let changed = 0;
  const roots = [path.join(dir, 'src'), path.join(dir, 'public')];
  for (const file of roots.flatMap((root) => walk(root))) {
    if (file.relative === 'package-lock.json') continue;
    const text = read(file.full);
    const next = text
      .replace(legacy, (_match, kind, slug, suffix = '') => {
        const tail = !suffix || suffix === '/' ? '/' : suffix;
        return `https://pants.place/sites/${kind}/${slug}${tail}`;
      })
      .replace(localPublic, (_match, kind, slug, suffix = '') => {
        const tail = !suffix || suffix === '/' ? '/' : suffix;
        return `https://pants.place/sites/${kind}/${slug}${tail}`;
      });
    if (next !== text) {
      write(file.full, next);
      changed++;
    }
  }
  return changed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir || !args.kind || !args.slug) usage('--dir, --kind and --slug are required');
  if (!['member', 'char'].includes(args.kind)) usage('--kind must be member or char');
  if (!/^[a-z0-9-]+$/.test(args.slug)) usage('--slug must contain only lowercase letters, digits and dashes');

  const dir = path.resolve(args.dir);
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    usage(`${dir} does not look like a subsite checkout (no package.json)`);
  }

  const kind = args.kind;
  const slug = args.slug;
  const base = `/sites/${kind}/${slug}`;
  const name = args.name || `pants-place-${kind}-${slug}`;

  writeIfChanged(path.join(dir, WRANGLER_PATH), wranglerConfig({ kind, slug, name }));
  const astroChanged = patchAstroConfig(dir, base);
  const linksChanged = patchLinks(dir);

  // Earlier versions of this helper added a prefix-stripping Worker. The
  // assets-only setup no longer needs it, so remove the generated file when it
  // is still the template copy.
  const legacyWorker = path.join(dir, LEGACY_WORKER_PATH);
  if (fs.existsSync(legacyWorker) && read(legacyWorker).includes('Serve a static Astro build under a path prefix')) {
    fs.rmSync(legacyWorker);
    const workerDir = path.dirname(legacyWorker);
    if (fs.readdirSync(workerDir).length === 0) fs.rmdirSync(workerDir);
  }

  if (args.githubWorkflow) {
    writeIfChanged(path.join(dir, WORKFLOW_PATH), workflow());
  }

  console.log(`[subsites] ${kind}/${slug} ready`);
  console.log(`[subsites]   Internal base: ${base}${astroChanged ? ' (updated)' : ''}`);
  console.log(`[subsites]   Public link:   https://pants.place/${kind}/${slug}`);
  console.log(`[subsites]   Config:        ${WRANGLER_PATH}`);
  console.log(`[subsites]   Links:         ${linksChanged} file${linksChanged === 1 ? '' : 's'} updated`);
  if (args.githubWorkflow) console.log(`[subsites]   Workflow:      ${WORKFLOW_PATH}`);
  console.log(`
Next:
  1. npm ci && npm run build
  2. Connect the repository to Cloudflare Workers Builds (build: npm run build)
     or commit the generated workflow with CLOUDFLARE_API_TOKEN and
     CLOUDFLARE_ACCOUNT_ID secrets.
  3. Publish the Worker. It serves ${base}/*. The parent pants-place-site
     Worker owns the public /${kind}/${slug} deep link and loads this route
     inside IE.
  4. If this is a new site, add its launcher metadata to
     src/data/personal-sites.ts and add this line to public/_redirects:
     /${kind}/${slug}/* /${kind}/${slug}/ 200`);
}

try {
  main();
} catch (error) {
  console.error(`[subsites] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
