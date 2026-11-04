import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const documents = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/documents' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    updated: z.string().optional(),
  }),
});

const web = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/web' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().default('pants_the_person'),
    kind: z.enum(['news', 'blog']),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { documents, web };
