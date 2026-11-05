import { signal } from '@preact/signals';
import media from 'virtual:media-manifest';
import type { DesktopDocument } from './types';

export const documents = signal<DesktopDocument[]>([]);
export const mediaFiles = signal(media);

export {
  fileSystem,
  fileSystemReady,
  fileSystemError,
  initFileSystem,
  refreshFileSystem,
  createFolder,
  createTextFile,
  readTextFile,
  readFileBytes,
  writeTextFile,
  writeBinaryFile,
  uploadFiles,
  renameNode,
  deleteNode,
  storageEstimate,
} from './fs-store';
export { layerStatus, type LayerState, type LayerStatus } from './fs-layers';
