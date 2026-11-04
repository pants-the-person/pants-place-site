import { getCollection, type CollectionEntry } from 'astro:content';

export type WebEntry = CollectionEntry<'web'>;

export async function getNews() {
  return (await getCollection('web', (entry) => entry.data.kind === 'news')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

export async function getBlog() {
  return (await getCollection('web', (entry) => entry.data.kind === 'blog')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

export function entrySlug(entry: WebEntry) {
  return entry.id.split('/').pop() ?? entry.id;
}

export function entryUrl(entry: WebEntry) {
  return entry.data.kind === 'news'
    ? `/web/news/${entrySlug(entry)}/`
    : `/web/blog/${entrySlug(entry)}/`;
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  });
}
