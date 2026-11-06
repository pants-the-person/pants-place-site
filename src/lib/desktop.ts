import { getCollection } from 'astro:content';
import type { DesktopDocument } from '../kernel/types';

export async function getDesktopDocuments(): Promise<DesktopDocument[]> {
  const entries = await getCollection('documents');
  return entries
    .sort((a, b) => a.data.title.localeCompare(b.data.title))
    .map((entry) => ({
      id: entry.id,
      title: entry.data.title,
      filename: `${entry.id.replace(/[^a-z0-9-]+/gi, '-').toUpperCase()}.TXT`,
      body: entry.body ?? '',
      updated: entry.data.updated,
    }));
}
