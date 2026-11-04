import { computed, signal } from '@preact/signals';
import media from 'virtual:media-manifest';
import type { DesktopDocument } from './types';
import { buildVfs } from './vfs';

export const documents = signal<DesktopDocument[]>([]);
export const fileSystem = computed(() => buildVfs(documents.value, media));
export const mediaFiles = signal(media);
