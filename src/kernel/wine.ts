import { openApp } from './windows';
import { wineAppsById, type WineAppInfo } from '../generated/wine-apps';

const pendingDrops = new Map<string, File[]>();

/** Native duplicate IDs that now open their Wine counterpart. */
export const wineEquivalents: Record<string, string> = {
  notepad: 'notepad',
  paint: 'mspaint98',
  calculator: 'calc',
  minesweeper: 'winmine_wep',
  wordpad: 'wordpad',
};

export function wineAppWindowId(id: string) {
  return `wine-${id}`;
}

export function isWineAppId(id: string) {
  return id.startsWith('wine-') && id !== 'wine-drop';
}

export interface WineLaunchOptions {
  /** Windows-style command line passed to the guest. */
  args?: string;
  title?: string;
}

export function openWineApp(id: string, options: WineLaunchOptions = {}) {
  const app: WineAppInfo | undefined = wineAppsById[id];
  if (!app) return false;
  openApp(wineAppWindowId(id), {
    wineAppId: id,
    title: options.title || app.title,
    experimental: app.experimental,
    launchArgs: options.args || undefined,
  });
  return true;
}

/**
 * Opens a file with a registered Wine program, e.g. a text document in Wine
 * Notepad. The guest receives the path as its command line after the runtime
 * has mounted the shared C: drive.
 */
export function openWineFile(id: string, path: string, title?: string) {
  if (!path) return false;
  return openWineApp(id, { args: path, title });
}

export function openWineDrop(files: File[], name?: string) {
  const list = Array.from(files || []);
  if (!list.length) return false;
  const token =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingDrops.set(token, list);
  const label = name || list[0]?.name || 'Dropped program';
  openApp('wine-drop', { token, name: label, title: `Wine-Assembly — ${label}` });
  return true;
}

export function openWinePath(path: string, name?: string) {
  if (!path) return false;
  const label = name || path.split('\\').pop() || 'Stored program';
  openApp('wine-drop', {
    launchPath: path,
    name: label,
    title: `Wine-Assembly — ${label}`,
  });
  return true;
}

export function takeWineDrop(token: string | undefined | null) {
  if (!token) return [];
  return pendingDrops.get(token) || [];
}

export function releaseWineDrop(token: string | undefined | null) {
  if (token) pendingDrops.delete(token);
}
