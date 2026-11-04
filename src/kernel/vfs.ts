import type { DesktopDocument } from './types';
import type { MediaEntry } from '../integrations/media-manifest';
import { wineApps } from '../generated/wine-apps';

export interface VfsFile {
  type: 'file';
  name: string;
  ext: string;
  size: number;
  modified: string;
  content?: string;
  url?: string;
  icon?: string;
  openWith?: string;
  props?: Record<string, unknown>;
}

export interface VfsFolder {
  type: 'folder';
  name: string;
  modified: string;
  children: VfsNode[];
}

export type VfsNode = VfsFile | VfsFolder;

const now = () => '11/04/1998 09:42 AM';

export function buildVfs(documents: DesktopDocument[], media: MediaEntry[]): VfsFolder {
  const docs: VfsFile[] = documents.map((doc) => ({
    type: 'file',
    name: doc.filename,
    ext: 'txt',
    size: new Blob([doc.body]).size,
    modified: doc.updated ?? now(),
    content: doc.body,
    openWith: 'notepad',
    props: { title: doc.title, body: doc.body, filename: doc.filename },
  }));

  const mediaFiles: VfsFile[] = media.map((entry) => ({
    type: 'file',
    name: entry.name,
    ext: entry.file.split('.').pop() ?? '',
    size: entry.size,
    modified: now(),
    url: entry.url,
    openWith: 'winamp',
    props: { mediaId: entry.id },
  }));

  return {
    type: 'folder',
    name: 'C:',
    modified: now(),
    children: [
      {
        type: 'folder',
        name: 'My Documents',
        modified: now(),
        children: docs,
      },
      {
        type: 'folder',
        name: 'Media',
        modified: now(),
        children: mediaFiles,
      },
      {
        type: 'folder',
        name: 'Program Files',
        modified: now(),
        children: [
          shortcut('Internet Explorer', 'ie', '/icons/ie.svg'),
          shortcut('Winamp', 'winamp', '/icons/winamp.svg'),
          shortcut('MS-DOS Prompt', 'terminal', '/icons/dos.svg'),
          shortcut('Notepad', 'notepad', '/icons/notepad.svg'),
          shortcut('Paint', 'paint', '/icons/paint.svg'),
          shortcut('Minesweeper', 'minesweeper', '/icons/mine.svg'),
          {
            type: 'folder',
            name: 'Wine-Assembly',
            modified: now(),
            children: wineApps.map((app) =>
              shortcut(app.title, `wine-${app.id}`, app.icon, {
                wineAppId: app.id,
                title: app.title,
              }),
            ),
          },
        ],
      },
      {
        type: 'folder',
        name: 'Windows',
        modified: now(),
        children: [
          file('SYSTEM.INI', 'system.ini', '[386Enh]\nPantsPlace98Wasm=1\n'),
          file('WIN.INI', 'win.ini', '[windows]\nDesktop=teal\n'),
          file('REGISTRY.DAT', 'registry.dat', 'HKEY_CURRENT_USER\\Software\\PantsPlace98\n'),
        ],
      },
      {
        type: 'folder',
        name: 'Temp',
        modified: now(),
        children: [file('README.TXT', 'readme.txt', 'This folder is empty. Mostly.')],
      },
    ],
  };
}

function file(name: string, ext: string, content: string, openWith = 'notepad'): VfsFile {
  return {
    type: 'file',
    name,
    ext,
    size: content.length,
    modified: now(),
    content,
    openWith,
    props: { title: name, body: content, filename: name },
  };
}

function shortcut(
  name: string,
  appId: string,
  icon: string,
  props: Record<string, unknown> = {},
): VfsFile {
  return {
    type: 'file',
    name: `${name}.lnk`,
    ext: 'lnk',
    size: 1024,
    modified: now(),
    icon,
    openWith: appId,
    props: { icon, ...props },
  };
}

export function findNode(root: VfsFolder, path: string[]): VfsNode | null {
  let node: VfsNode = root;
  for (const part of path) {
    if (node.type !== 'folder') return null;
    const next = node.children.find((child) => child.name === part);
    if (!next) return null;
    node = next;
  }
  return node;
}
