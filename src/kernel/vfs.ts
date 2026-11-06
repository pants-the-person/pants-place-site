import type { DesktopDocument } from './types';
import type { MediaEntry } from '../integrations/media-manifest';

export interface VfsFile {
  type: 'file';
  name: string;
  path?: string;
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
  path?: string;
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

  const programs = folder('Program Files', [
    folder('Accessories', [
      shortcut('Calculator', 'calculator', '/icons/calculator.svg'),
      shortcut('Notepad', 'notepad', '/icons/notepad.svg'),
      shortcut('Paint', 'paint', '/icons/paint.svg'),
      shortcut('WordPad', 'wordpad', '/icons/notepad.svg'),
    ]),
    folder('Games', [
      shortcut('Minesweeper', 'minesweeper', '/icons/mine.svg'),
      shortcut('Solitaire', 'wine-sol', '/icons/mine.svg'),
    ]),
    folder('Internet Explorer', [
      shortcut('Internet Explorer', 'ie', '/icons/ie.svg'),
      file('README.TXT', 'readme.txt', 'Internet Explorer 5.0\nConnect to PantsNet through your dial-up adapter.\n'),
    ]),
    folder('Winamp', [
      shortcut('Winamp', 'winamp', '/icons/winamp.svg'),
      file('WINAMP.INI', 'winamp.ini', '[Winamp]\nmb_open=0\ncheck_ft_startup=0\n'),
      file('WINAMP.M3U', 'winamp.m3u', '#EXTM3U\nC:\\Media\\pants-theme.mid\nC:\\Media\\chiptune-c64.ogg\n'),
    ]),
    folder('MS-DOS Prompt', [
      shortcut('MS-DOS Prompt', 'terminal', '/icons/dos.svg'),
      file('README.TXT', 'readme.txt', 'FreeDOS 7.10 is available from the Start menu.\n'),
    ]),
  ]);

  const windows = folder('Windows', [
    file('WIN.INI', 'win.ini', '[windows]\nDesktop=teal\nWallpaper=(None)\n'),
    file('SYSTEM.INI', 'system.ini', '[386Enh]\nPantsPlace98Wasm=1\n'),
    file('REGISTRY.DAT', 'registry.dat', 'HKEY_CURRENT_USER\\Software\\PantsPlace98\n'),
    file('WIN.COM', 'win.com', 'Pants Place 98 boots from the web.\n'),
    folder('SYSTEM', [
      file('KERNEL32.DLL', 'dll', 'Mock Windows system library.'),
      file('USER32.DLL', 'dll', 'Mock Windows system library.'),
      file('GDI32.DLL', 'dll', 'Mock Windows system library.'),
      file('SHELL32.DLL', 'dll', 'Mock Windows system library.'),
      file('README.TXT', 'readme.txt', 'Core Windows 98 system files live here.\n'),
    ]),
    folder('SYSTEM32', [
      file('README.TXT', 'readme.txt', '32-bit drivers and system tools.\n'),
      file('NOTEPAD.TXT', 'notepad.txt', 'Launch Notepad from Program Files instead.'),
    ]),
    folder('FONTS', [file('README.TXT', 'readme.txt', 'MS Sans Serif, Tahoma and Fixedsys are installed.\n')]),
    folder('HELP', [file('README.TXT', 'readme.txt', 'Windows Help files.\n')]),
    folder('MEDIA', [file('README.TXT', 'readme.txt', 'Windows sound schemes and startup sounds.\n')]),
    folder('TEMP', [file('README.TXT', 'readme.txt', 'Temporary files are safe to delete.\n')]),
    folder('RECENT', []),
    folder('DESKTOP', []),
    folder('INF', [file('README.TXT', 'readme.txt', 'Setup information files.\n')]),
    folder('START MENU', [
      folder('Programs', [
        folder('Accessories', [
          shortcut('Calculator', 'calculator', '/icons/calculator.svg'),
          shortcut('Notepad', 'notepad', '/icons/notepad.svg'),
          shortcut('Paint', 'paint', '/icons/paint.svg'),
          shortcut('WordPad', 'wordpad', '/icons/notepad.svg'),
        ]),
        folder('Games', [
          shortcut('Minesweeper', 'minesweeper', '/icons/mine.svg'),
          shortcut('Solitaire', 'wine-sol', '/icons/mine.svg'),
        ]),
        shortcut('Internet Explorer', 'ie', '/icons/ie.svg'),
        shortcut('MS-DOS Prompt', 'terminal', '/icons/dos.svg'),
        shortcut('Winamp', 'winamp', '/icons/winamp.svg'),
      ]),
      folder('Documents', []),
      folder('Settings', [
        shortcut('Control Panel', 'control', '/icons/settings.svg'),
        shortcut('Display Properties', 'display', '/icons/settings.svg'),
      ]),
    ]),
  ]);

  return folder(
    'C:',
    [
      file('AUTOEXEC.BAT', 'bat', '@ECHO OFF\nPROMPT $P$G\nSET PATH=C:\\WINDOWS;C:\\WINDOWS\\COMMAND\n'),
      file('CONFIG.SYS', 'sys', 'DEVICE=C:\\WINDOWS\\HIMEM.SYS\nDOS=HIGH,UMB\nFILES=30\n'),
      file('MSDOS.SYS', 'sys', '; Pants Place 98 mock boot configuration\n[Paths]\nWinDir=C:\\WINDOWS\n'),
      file('IO.SYS', 'sys', 'Mock DOS boot sector.'),
      file('COMMAND.COM', 'com', 'Mock DOS command interpreter.'),
      folder('My Documents', [
        ...docs,
        folder('My Pictures', [file('README.TXT', 'readme.txt', 'Put bitmap files here.\n')]),
        folder('My Music', [file('README.TXT', 'readme.txt', 'Winamp can play files from C:\\Media.\n')]),
      ]),
      folder('Media', mediaFiles),
      folder('Downloads', [file('README.TXT', 'readme.txt', 'Downloaded files land here.\n')]),
      folder('Desktop', [
        shortcut('My Computer', 'computer', '/icons/computer.svg'),
        shortcut('My Documents', 'computer', '/icons/folder.svg', { path: ['C:', 'My Documents'] }),
        shortcut('Internet Explorer', 'ie', '/icons/ie.svg'),
        shortcut('Winamp', 'winamp', '/icons/winamp.svg'),
        shortcut('Recycle Bin', 'computer', '/icons/recycle-empty.svg', { recycle: true }),
      ]),
      programs,
      windows,
      folder('Temp', [file('README.TXT', 'readme.txt', 'This folder is empty. Mostly.')]),
      folder('Recycled', []),
      folder('Config', [file('README.TXT', 'readme.txt', 'System configuration backups.\n')]),
    ],
  );
}

function folder(name: string, children: VfsNode[]): VfsFolder {
  return {
    type: 'folder',
    name,
    modified: now(),
    children,
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
