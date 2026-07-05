import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const entries = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/entries" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    type: z.enum(["project", "prototype", "artwork", "concept", "experiment", "note", "fragment"]),
    status: z.enum(["finished", "active", "ongoing", "prototype", "study", "speculative", "dormant", "abandoned"]),
    year: z.number(),
    date: z.coerce.date().optional(),
    cover: z.string().optional(),
    subjects: z.array(z.string()).default([]),
    media: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    context: z.enum(["commissioned", "professional", "independent", "personal", "research"]).optional(),
    externalUrl: z.string().url().optional(),
    featured: z.boolean().default(false),
    current: z.boolean().default(false),
    order: z.number().default(100),
    draft: z.boolean().default(true),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { entries, pages };
