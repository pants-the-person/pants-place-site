import { openApp } from './windows';
import { wineAppsById, type WineAppInfo } from '../generated/wine-apps';

const pendingDrops = new Map<string, File[]>();

export function wineAppWindowId(id: string) {
  return `wine-${id}`;
}

export function isWineAppId(id: string) {
  return id.startsWith('wine-') && id !== 'wine-drop';
}

export function openWineApp(id: string) {
  const app: WineAppInfo | undefined = wineAppsById[id];
  if (!app) return false;
  openApp(wineAppWindowId(id), {
    wineAppId: id,
    title: app.title,
    experimental: app.experimental,
  });
  return true;
}

export function openWineLauncher() {
  openApp('wine-launcher');
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

export function takeWineDrop(token: string | undefined | null) {
  if (!token) return [];
  return pendingDrops.get(token) || [];
}

export function releaseWineDrop(token: string | undefined | null) {
  if (token) pendingDrops.delete(token);
}
