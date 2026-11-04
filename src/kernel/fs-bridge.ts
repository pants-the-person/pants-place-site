import {
  applyWineRecords,
  readFileBytes,
  snapshotForWine,
  type WineFsRecord,
} from './fs-store';

const PREFIX = 'wine:fs-';

type BridgeMessage = {
  type?: unknown;
  id?: unknown;
  path?: unknown;
  records?: unknown;
};

let installed = false;

function isRecordList(value: unknown): value is WineFsRecord[] {
  return Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reply(
  target: Window,
  type: string,
  id: unknown,
  payload: Record<string, unknown>,
) {
  try {
    target.postMessage({ type, id, ...payload }, window.location.origin);
  } catch {
    /* the window may be closing */
  }
}

async function handleSnapshot(target: Window, id: unknown) {
  try {
    const snapshot = await snapshotForWine();
    reply(target, 'wine:fs-snapshot-result', id, {
      records: snapshot.records,
      warnings: snapshot.warnings,
    });
  } catch (error) {
    reply(target, 'wine:fs-snapshot-result', id, {
      records: [],
      warnings: [],
      error: errorMessage(error),
    });
  }
}

async function handleWrite(target: Window, id: unknown, records: unknown) {
  if (!isRecordList(records)) {
    reply(target, 'wine:fs-write-result', id, {
      written: 0,
      removed: 0,
      error: 'Invalid filesystem records.',
    });
    return;
  }
  try {
    const result = await applyWineRecords(records);
    reply(target, 'wine:fs-write-result', id, result);
  } catch (error) {
    reply(target, 'wine:fs-write-result', id, {
      written: 0,
      removed: 0,
      error: errorMessage(error),
    });
  }
}

async function handleRead(target: Window, id: unknown, path: unknown) {
  if (typeof path !== 'string' || !path) {
    reply(target, 'wine:fs-read-result', id, {
      data: null,
      error: 'Invalid path.',
    });
    return;
  }
  try {
    const data = await readFileBytes(path);
    reply(target, 'wine:fs-read-result', id, { data });
  } catch (error) {
    reply(target, 'wine:fs-read-result', id, {
      data: null,
      error: errorMessage(error),
    });
  }
}

/**
 * Installs the parent side of the Wine filesystem bridge. The Wine runtime
 * asks for a C:\ snapshot when an app launches, and sends every guest write
 * back here so ZenFS remains the single source of truth.
 */
export function installFilesystemBridge() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as BridgeMessage | null;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith(PREFIX)) return;
    if (data.type === 'wine:fs-ready') return;

    const source = event.source as Window | null;
    if (!source || source === window) return;

    if (data.type === 'wine:fs-snapshot') {
      void handleSnapshot(source, data.id);
    } else if (data.type === 'wine:fs-write') {
      void handleWrite(source, data.id, data.records);
    } else if (data.type === 'wine:fs-read') {
      void handleRead(source, data.id, data.path);
    }
  });
}
