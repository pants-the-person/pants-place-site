import { getApp, openApp } from './windows';
import { openWineApp, wineEquivalents } from './wine';
import { wineApps } from '../generated/wine-apps';
import {
  addressForLauncherPath,
  personalSiteList,
  siteForLauncherPath,
  type PersonalSite,
} from './sites';

export interface PersonalSiteDeepLink {
  siteId?: string;
  address: string;
}

type LaunchTarget =
  | { key: string; kind: 'native'; appId: string }
  | { key: string; kind: 'wine'; wineId: string };

const NATIVE_ALIASES: Record<string, string> = {
  ie: 'ie',
  'iexplore.exe': 'ie',
  iexplore: 'ie',
  'explorer.exe': 'computer',
  explorer: 'computer',
  'cmd.exe': 'terminal',
  cmd: 'terminal',
  'command.com': 'terminal',
  command: 'terminal',
  terminal: 'terminal',
  'control.exe': 'control',
  control: 'control',
  'help.exe': 'help',
  help: 'help',
  computer: 'computer',
};

const WINE_BY_NAME = new Map<string, string>();
for (const app of wineApps) {
  WINE_BY_NAME.set(app.id.toLowerCase(), app.id);
  WINE_BY_NAME.set(`wine-${app.id}`.toLowerCase(), app.id);
  if (app.exe) {
    const file = app.exe.split(/[\\/]/).pop()?.toLowerCase() || '';
    if (file) {
      WINE_BY_NAME.set(file, app.id);
      WINE_BY_NAME.set(file.replace(/\.exe$/i, ''), app.id);
    }
  }
}

function normalizeToken(raw: string): { full: string; withoutExe: string } {
  const full = String(raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.toLowerCase() || '';
  return { full, withoutExe: full.replace(/\.exe$/i, '') };
}

function resolveNative(appId: string): LaunchTarget | null {
  const equivalent = wineEquivalents[appId];
  if (equivalent) {
    const wineId = WINE_BY_NAME.get(equivalent.toLowerCase()) || equivalent;
    return { key: `wine:${wineId}`, kind: 'wine', wineId };
  }
  if (!getApp(appId)) return null;
  return { key: `native:${appId}`, kind: 'native', appId };
}

export function resolveAutostartTarget(raw: string): LaunchTarget | null {
  const { full, withoutExe } = normalizeToken(raw);
  if (!full) return null;
  const names = full === withoutExe ? [full] : [full, withoutExe];

  for (const name of names) {
    const native = NATIVE_ALIASES[name];
    if (native) return { key: `native:${native}`, kind: 'native', appId: native };
  }

  for (const name of names) {
    const wineId = WINE_BY_NAME.get(name);
    if (wineId) return { key: `wine:${wineId}`, kind: 'wine', wineId };
  }

  for (const name of names) {
    const native = resolveNative(name);
    if (native) return native;
  }

  return null;
}

export function parseAutostart(search: string): string[] {
  const params = new URLSearchParams(search);
  const values = params
    .getAll('autostart')
    .flatMap((value) => value.split(/[,;]/))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function siteForDeepLink(deepLink: PersonalSiteDeepLink | null | undefined, pathname: string): PersonalSite | null {
  if (deepLink?.siteId) {
    const site = personalSiteList.find((entry) => `${entry.kind}/${entry.slug}` === deepLink.siteId);
    if (site) return site;
  }
  return siteForLauncherPath(pathname);
}

function notify(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pants:notify', { detail: message }));
}

let started = false;

/**
 * Resolve the current path/query into windows. Path-based autostart and
 * query-based autostart are independent but share this single entry point.
 */
export function startDeepLink(
  deepLink?: PersonalSiteDeepLink | null,
  options: { search?: string; pathname?: string } = {},
) {
  if (started) return;
  started = true;

  const search = options.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const pathname = options.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const site = siteForDeepLink(deepLink, pathname);
  const address = site
    ? addressForLauncherPath(pathname, site) || deepLink?.address || ''
    : '';

  if (site && address) {
    openApp('ie', { address });
  }

  const tokens = parseAutostart(search);
  const targets: LaunchTarget[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    const target = resolveAutostartTarget(token);
    if (target) targets.push(target);
    else unknown.push(token);
  }

  let openedInternetExplorer = Boolean(site);
  for (const target of new Map(targets.map((target) => [target.key, target])).values()) {
    if (target.kind === 'wine') {
      openWineApp(target.wineId);
      continue;
    }
    if (target.appId === 'ie' && openedInternetExplorer) continue;
    openApp(target.appId);
    if (target.appId === 'ie') openedInternetExplorer = true;
  }

  if (unknown.length) {
    notify(`Cannot find the program "${unknown[0]}".`);
  }
}

/** Test helper. */
export function resetDeepLinkForTests() {
  started = false;
}
