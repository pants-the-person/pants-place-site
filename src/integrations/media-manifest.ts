import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

export interface MediaEntry {
  id: string;
  name: string;
  title: string;
  file: string;
  url: string;
  kind: 'midi' | 'audio';
  size: number;
}

const VIRTUAL_ID = 'virtual:media-manifest';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const EXTENSIONS = new Set(['.mid', '.midi', '.ogg', '.oga']);

export function prettifyName(file: string) {
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scanMedia(dir: string, base = ''): MediaEntry[] {
  if (!fs.existsSync(dir)) return [];
  const out: MediaEntry[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...scanMedia(full, rel));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const stat = fs.statSync(full);
    const kind: MediaEntry['kind'] = ext === '.mid' || ext === '.midi' ? 'midi' : 'audio';
    out.push({
      id: rel.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      name: entry.name,
      title: prettifyName(entry.name),
      file: rel,
      url: `/media/${rel.split('/').map(encodeURIComponent).join('/')}`,
      kind,
      size: stat.size,
    });
  }
  return out;
}

export default function mediaManifest(): AstroIntegration {
  let mediaDir = '';
  return {
    name: 'pants-media-manifest',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        mediaDir = fileURLToPath(new URL('./public/media/', config.root));
        const safeDir = mediaDir.endsWith(path.sep) ? mediaDir : mediaDir + path.sep;

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'pants-media-manifest',
                resolveId(id) {
                  if (id === VIRTUAL_ID) return RESOLVED_ID;
                },
                load(id) {
                  if (id !== RESOLVED_ID) return;
                  const entries = scanMedia(mediaDir).sort((a, b) => {
                    if (a.kind !== b.kind) return a.kind === 'midi' ? -1 : 1;
                    return a.file.localeCompare(b.file);
                  });
                  return `export default ${JSON.stringify(entries)};`;
                },
                configureServer(server) {
                  server.watcher.add(mediaDir);
                  const refresh = (file: string) => {
                    if (!file.startsWith(safeDir)) return;
                    const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                    server.ws.send({ type: 'full-reload' });
                  };
                  server.watcher.on('add', refresh);
                  server.watcher.on('unlink', refresh);
                  server.watcher.on('change', refresh);
                },
              },
            ],
          },
        });
      },
    },
  };
}
