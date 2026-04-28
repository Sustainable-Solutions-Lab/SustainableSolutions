// Astro Content Collections — explicit definitions silence the auto-generated
// collection deprecation warning and let pages call getEntry/getCollection.
//
// Each folder under src/content/ is a collection. Collections are optional —
// if no .md files exist, the collection is empty.

import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    order: z.number().optional(),
  }),
})

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    summary: z.string().optional(),
  }),
})

const people = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/people' }),
  schema: z.object({
    title: z.string().optional(),
    role: z.string().optional(),
  }),
})

const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().optional(),
    eyebrow: z.string().optional(),       // e.g. "INTERACTIVE MAP", "DATASET", "CODE"
    image_filename: z.string().optional(),// resolves to /public/tools/, /public/images/
    link: z.string().optional(),          // internal route or external URL; default /tools/<slug>
    order: z.number().optional(),
  }),
})

export const collections = { research, news, people, tools }
