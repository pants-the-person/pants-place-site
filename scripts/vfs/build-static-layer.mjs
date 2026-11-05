import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, Index, Inode } from '@zenfs/core';
import { buildVfs } from '../../src/kernel/vfs.ts';
import { prettifyName } from '../../src/integrations/media-manifest.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const docsDir = path.join(root, 'src/content/documents');
const mediaDir = path.join(root, 'public/media');
const outDir = path.join(root, 'public/vfs-static');
const indexFile = path.join(root, 'public/vfs-static.index.json');
const metaFile = path.join(root, 'public/vfs-static.meta.json');
const MEDIA_EXTENSIONS = new Set(['.mid', '.midi', '.ogg', '.oga']);

function readDocuments() {
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const raw = fs.readFileSync(path.join(docsDir, name), 'utf8');
      const front = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
      const meta = front?.[1] || '';
      const title = /^title:\s*(.+)$/m.exec(meta)?.[1]?.trim() || name.replace(/\.md$/, '');
      const updated = /^updated:\s*(.+)$/m.exec(meta)?.[1]?.trim();
      const id = name.replace(/\.md$/, '');
      return {
        id,
        title: title.replace(/^["']|["']$/g, ''),
        filename: `${id.replace(/[^a-z0-9-]+/gi, '-').toUpperCase()}.TXT`,
        body: front?.[2] ?? raw,
        updated,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function scanMedia(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...scanMedia(full, rel));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;
    out.push({
      id: rel.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      name: entry.name,
      title: prettifyName(entry.name),
      file: rel,
      url: `/media/${rel.split('/').map(encodeURIComponent).join('/')}`,
      kind: ext === '.mid' || ext === '.midi' ? 'midi' : 'audio',
      size: fs.statSync(full).size,
    });
  }
  return out;
}

function writeTree(folder, dir, mediaById) {
  fs.mkdirSync(dir, { recursive: true });
  for (const child of folder.children) {
    const target = path.join(dir, child.name);
    if (child.type === 'folder') {
      writeTree(child, target, mediaById);
      continue;
    }
    let data = child.content ?? '';
    if (child.url) {
      const mediaEntry = mediaById.get(String(child.props?.mediaId ?? ''));
      if (mediaEntry) {
        fs.copyFileSync(path.join(mediaDir, mediaEntry.file), target);
        continue;
      }
      data = `[InternetShortcut]\nURL=${child.url}\nX-Pants-Media-Id=${String(child.props?.mediaId ?? '')}\n`;
    } else if (child.ext === 'lnk') {
      data = JSON.stringify({
        appId: child.openWith || null,
        icon: child.icon || null,
        props: child.props || {},
      });
    }
    fs.writeFileSync(target, data);
  }
}

function addDir(index, relative, next) {
  if (relative === '/') return;
  const parts = relative.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    if (index.has(current)) continue;
    const ino = next.ino++;
    index.set(
      current,
      new Inode({
        ino,
        data: next.data++,
        mode: constants.S_IFDIR | 0o777,
        size: 0,
        mtimeMs: Date.now(),
      }),
    );
  }
}

function addFile(index, relative, size, mtimeMs, next) {
  const ino = next.ino++;
  index.set(
    relative,
    new Inode({
      ino,
      data: next.data++,
      mode: constants.S_IFREG | 0o644,
      size,
      mtimeMs,
    }),
  );
}

function buildIndex(dir, relative = '/') {
  const index = new Index();
  index.maxSize = 1024 * 1024 * 1024;
  const next = { ino: 1, data: 1 };
  index.set(
    '/',
    new Inode({
      ino: 0,
      data: 0,
      mode: constants.S_IFDIR | 0o777,
      size: 0,
      mtimeMs: Date.now(),
    }),
  );

  function walk(current, rel) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const pathname = `${rel.replace(/\/$/, '')}/${entry.name}`;
      if (entry.isDirectory()) {
        addDir(index, pathname, next);
        walk(full, pathname);
        continue;
      }
      const stat = fs.statSync(full);
      addDir(index, path.dirname(pathname), next);
      addFile(index, pathname, stat.size, stat.mtimeMs, next);
    }
  }

  walk(dir, relative);
  return index.toJSON();
}

function collectMeta(folder, base = '') {
  const meta = {};
  for (const child of folder.children) {
    const relative = base ? `${base}/${child.name}` : child.name;
    if (child.type === 'folder') {
      Object.assign(meta, collectMeta(child, relative));
      continue;
    }
    const key = `c:\\${relative.replace(/\//g, '\\')}`.toLowerCase();
    if (child.url) {
      meta[key] = {
        url: child.url,
        mediaId: String(child.props?.mediaId ?? ''),
        size: child.size,
        openWith: child.openWith,
      };
    } else if (child.ext === 'lnk') {
      meta[key] = {
        openWith: child.openWith,
        icon: child.icon,
        props: child.props,
      };
    } else if (['mid', 'midi', 'ogg', 'oga'].includes(child.ext)) {
      meta[key] = {
        openWith: 'winamp',
        props: { mediaId: String(child.props?.mediaId ?? '') },
      };
    }
  }
  return meta;
}

fs.rmSync(outDir, { recursive: true, force: true });
const documents = readDocuments();
const media = scanMedia(mediaDir).sort((a, b) => {
  if (a.kind !== b.kind) return a.kind === 'midi' ? -1 : 1;
  return a.file.localeCompare(b.file);
});
const tree = buildVfs(documents, media);
writeTree(tree, outDir, new Map(media.map((entry) => [entry.id, entry])));
fs.writeFileSync(indexFile, JSON.stringify(buildIndex(outDir), null, 2));
fs.writeFileSync(metaFile, JSON.stringify(collectMeta(tree), null, 2));
console.log(`Generated static VFS layer: ${outDir} (${documents.length} documents, ${media.length} media entries)`);
