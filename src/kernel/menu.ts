import { signal } from '@preact/signals';

export interface MenuItem {
  label?: string;
  icon?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  action?: () => void | Promise<void>;
  children?: MenuItem[];
}

export interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export const contextMenu = signal<ContextMenuState | null>(null);

export function openContextMenu(event: MouseEvent, items: MenuItem[]) {
  if (!items.length) return;
  event.preventDefault();
  event.stopPropagation();
  const width = 210;
  const height = Math.min(items.length * 24 + 10, window.innerHeight - 16);
  contextMenu.value = {
    x: Math.max(2, Math.min(event.clientX, window.innerWidth - width - 4)),
    y: Math.max(2, Math.min(event.clientY, window.innerHeight - height - 36)),
    items,
  };
}

export function closeContextMenu() {
  contextMenu.value = null;
}
