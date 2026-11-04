import { signal } from '@preact/signals';
import type { DialogOptions, DialogState } from './types';

let dialogCounter = 0;
export const dialogs = signal<DialogState[]>([]);

export function showDialog(options: DialogOptions): Promise<string> {
  return new Promise((resolve) => {
    const id = `dlg-${++dialogCounter}`;
    dialogs.value = [
      ...dialogs.value,
      {
        buttons: [{ id: 'ok', label: 'OK', default: true }],
        ...options,
        id,
        resolve,
      },
    ];
  });
}

export function resolveDialog(id: string, result: string) {
  const dialog = dialogs.value.find((d) => d.id === id);
  if (!dialog) return;
  dialogs.value = dialogs.value.filter((d) => d.id !== id);
  dialog.resolve(result);
}

export function closeAllDialogs() {
  for (const dialog of dialogs.value) dialog.resolve('cancel');
  dialogs.value = [];
}
