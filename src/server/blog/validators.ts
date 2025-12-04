import { z } from 'zod';

const slug = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes');

const tags = z.array(z.string().trim().min(1).max(32)).max(16);

export const createPostSchema = z.object({
  slug,
  title: z.string().min(3).max(160),
  summary: z.string().min(10).max(500),
  tags: tags.optional().default([]),
  heroImageKey: z.string().min(3).max(512).optional(),
});

export const saveDraftSchema = z.object({
  slug,
  body: z.string().min(1),
  title: z.string().min(3).max(160).optional(),
  summary: z.string().min(10).max(500).optional(),
  tags: tags.optional(),
  heroImageKey: z.string().min(3).max(512).optional(),
  extension: z.enum(['md', 'mdx']).optional(),
  version: z.number().int().nonnegative(),
});

export const publishPostSchema = z.object({
  slug,
  version: z.number().int().nonnegative(),
  publishedAt: z.string().datetime().optional(),
});

export const schedulePostSchema = z.object({
  slug,
  version: z.number().int().nonnegative(),
  scheduledFor: z.string().datetime(),
});

export const deletePostSchema = z.object({
  slug,
});

export const archivePostSchema = z.object({
  slug,
  version: z.number().int().nonnegative(),
});

export const unschedulePostSchema = z.object({
  slug,
  version: z.number().int().nonnegative(),
});

export const presignedUploadSchema = z.object({
  contentType: z.string().min(3),
  extension: z
    .string()
    .regex(/^[a-z0-9]+$/i)
    .optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type PublishPostInput = z.infer<typeof publishPostSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type DeletePostInput = z.infer<typeof deletePostSchema>;
export type PresignedUploadInput = z.infer<typeof presignedUploadSchema>;
export type ArchivePostInput = z.infer<typeof archivePostSchema>;
export type UnschedulePostInput = z.infer<typeof unschedulePostSchema>;
