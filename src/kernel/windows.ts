import { signal } from '@preact/signals';
import { showDialog } from './dialogs';
import type { AppApi, AppDefinition, WindowState } from './types';

export const windows = signal<WindowState[]>([]);
export const activeWindowId = signal<string | null>(null);
export const startMenuOpen = signal(false);

const registry = new Map<string, AppDefinition>();
let windowCounter = 0;
let zCounter = 100;

export function registerApps(apps: AppDefinition[]) {
  for (const app of apps) registry.set(app.id, app);
}

export function getApp(id: string) {
  return registry.get(id);
}

export function listApps() {
  return [...registry.values()];
}

export function desktopApps() {
  return listApps().filter((app) => app.desktop && !app.hidden);
}

function desktopBounds() {
  return {
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight - 32,
  };
}

function makeApi(id: string): AppApi {
  return {
    close: () => closeWindow(id),
    focus: () => focusWindow(id),
    setTitle: (title) => setWindowTitle(id, title),
    openApp: (appId, props) => openApp(appId, props),
    dialog: showDialog,
    notify: (message) => {
      // A lightweight transient message; kept intentionally simple.
      window.dispatchEvent(new CustomEvent('pants:notify', { detail: message }));
    },
  };
}

export function getAppApi(id: string) {
  return makeApi(id);
}

export function openApp(
  appId: string,
  props: Record<string, unknown> = {},
  placement?: { x: number; y: number },
) {
  const def = getApp(appId);
  if (!def) {
    void showDialog({
      title: 'Pants Place 98',
      message: `Cannot find the program "${appId}".`,
      kind: 'error',
      icon: '/icons/computer.svg',
    });
    return;
  }

  if (def.singleton) {
    const existing = windows.value.find((w) => w.appId === appId);
    if (existing) {
      if (existing.mode === 'min') restoreWindow(existing.id);
      focusWindow(existing.id);
      return;
    }
  }

  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    const bounds = desktopBounds();
    const id = `${appId}-${++windowCounter}`;
    windows.value = [
      ...windows.value,
      {
        id,
        appId,
        title: def.title,
        icon: def.icon,
        x: 0,
        y: 0,
        w: bounds.w,
        h: bounds.h,
        z: ++zCounter,
        mode: 'max',
        props,
        resizable: def.resizable !== false,
        chrome: def.chrome ?? 'win98',
        minW: def.minSize?.w ?? 260,
        minH: def.minSize?.h ?? 180,
        createdAt: Date.now(),
      },
    ];
    activeWindowId.value = id;
    startMenuOpen.value = false;
    return;
  }

  const bounds = desktopBounds();
  const offset = (windows.value.length % 7) * 24;
  const w = Math.min(def.defaultSize.w, bounds.w - 24);
  const h = Math.min(def.defaultSize.h, bounds.h - 24);
  const id = `${appId}-${++windowCounter}`;
  const x = placement?.x ?? Math.max(8, Math.min(80 + offset, bounds.w - w - 8));
  const y = placement?.y ?? Math.max(8, Math.min(48 + offset, bounds.h - h - 8));

  windows.value = [
    ...windows.value,
    {
      id,
      appId,
      title: def.title,
      icon: def.icon,
      x,
      y,
      w,
      h,
      z: ++zCounter,
      mode: 'normal',
      props,
      resizable: def.resizable !== false,
      chrome: def.chrome ?? 'win98',
      minW: def.minSize?.w ?? 260,
      minH: def.minSize?.h ?? 180,
      createdAt: Date.now(),
    },
  ];
  activeWindowId.value = id;
  startMenuOpen.value = false;
}

export function closeWindow(id: string) {
  windows.value = windows.value.filter((w) => w.id !== id);
  if (activeWindowId.value === id) {
    const remaining = windows.value.filter((w) => w.mode !== 'min');
    activeWindowId.value = remaining.length ? remaining[remaining.length - 1].id : null;
  }
}

export function focusWindow(id: string) {
  const target = windows.value.find((w) => w.id === id);
  if (!target) return;
  const z = ++zCounter;
  windows.value = windows.value.map((w) => (w.id === id ? { ...w, z } : w));
  activeWindowId.value = id;
  startMenuOpen.value = false;
}

export function minimizeWindow(id: string) {
  windows.value = windows.value.map((w) =>
    w.id === id ? { ...w, mode: 'min' as const } : w,
  );
  if (activeWindowId.value === id) {
    const remaining = windows.value.filter((w) => w.mode !== 'min');
    activeWindowId.value = remaining.length ? remaining[remaining.length - 1].id : null;
  }
}

export function restoreWindow(id: string) {
  windows.value = windows.value.map((w) =>
    w.id === id ? { ...w, mode: 'normal' as const } : w,
  );
  focusWindow(id);
}

export function toggleMaximizeWindow(id: string) {
  windows.value = windows.value.map((w) => {
    if (w.id !== id) return w;
    if (w.mode === 'max') {
      return {
        ...w,
        mode: 'normal' as const,
        ...(w.restore ?? {}),
      };
    }
    return {
      ...w,
      mode: 'max' as const,
      restore: { x: w.x, y: w.y, w: w.w, h: w.h },
    };
  });
  focusWindow(id);
}

export function setWindowTitle(id: string, title: string) {
  const current = windows.value.find((w) => w.id === id);
  if (!current || current.title === title) return;
  windows.value = windows.value.map((w) => (w.id === id ? { ...w, title } : w));
}

export function updateWindowBounds(
  id: string,
  bounds: Partial<Pick<WindowState, 'x' | 'y' | 'w' | 'h'>>,
) {
  windows.value = windows.value.map((w) => (w.id === id ? { ...w, ...bounds } : w));
}

export function taskbarWindows() {
  return windows.value.filter((w) => w.mode !== 'min');
}

export function isActive(id: string) {
  return activeWindowId.value === id;
}

export function closeAllWindows() {
  windows.value = [];
  activeWindowId.value = null;
}
