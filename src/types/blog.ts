export type BlogPostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface BlogPostSummary {
  slug: string;
  title: string;
  summary: string;
  status: BlogPostStatus;
  publishedAt?: string;
  updatedAt: string;
  tags: string[];
  heroImageKey?: string;
  readTimeMinutes?: number;
  readTimeLabel?: string;
}

export interface BlogPostRecord extends BlogPostSummary {
  currentRevisionKey?: string;
  version: number;
  scheduledFor?: string;
  activeScheduleArn?: string;
  activeScheduleName?: string;
}

export interface BlogPostWithContent extends BlogPostRecord {
  content: string;
}
