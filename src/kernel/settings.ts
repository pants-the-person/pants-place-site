import { signal } from '@preact/signals';

export interface Settings {
  scheme: 'standard' | 'brick' | 'desert' | 'hotdog' | 'plum' | 'rose' | 'highcontrast';
  wallpaper: 'teal' | 'clouds' | 'pipes' | 'stars' | 'none';
  sound: boolean;
  crt: boolean;
  clock24: boolean;
  dragContents: boolean;
  screensaver: boolean;
}

const STORAGE_KEY = 'pp98:settings';

const defaults: Settings = {
  scheme: 'standard',
  wallpaper: 'teal',
  sound: true,
  crt: false,
  clock24: false,
  dragContents: true,
  screensaver: true,
};

function load(): Settings {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return defaults;
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export const settings = signal<Settings>(load());
export const volume = signal(0.8);

function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.scheme = s.scheme;
  document.documentElement.dataset.wallpaper = s.wallpaper;
  document.documentElement.dataset.crt = String(s.crt);
}

export function initSettings() {
  apply(settings.value);
  if (typeof window !== 'undefined') {
    window.addEventListener('pants:settings', () => apply(settings.value));
  }
}

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  apply(settings.value);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch {
    /* private mode */
  }
}

export function resetSettings() {
  updateSettings(defaults);
}
