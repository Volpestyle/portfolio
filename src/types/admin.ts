import type { BlogPostRecord, BlogPostStatus } from './blog';

// API Request Types
export interface CreatePostRequest {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  heroImageKey?: string;
  content: string;
}

export interface UpdatePostRequest extends CreatePostRequest {
  version?: number; // for optimistic locking
}

export interface ListPostsRequest {
  status?: BlogPostStatus;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface SchedulePostRequest {
  slug: string;
  publishedAt: string; // ISO 8601 date
}

export interface PresignedUploadRequest {
  contentType: string;
  ext: string;
}

// API Response Types
export interface CreatePostResponse {
  slug: string;
  version: number;
  message: string;
}

export interface UpdatePostResponse {
  slug: string;
  version: number;
  message: string;
}

export interface ListPostsResponse {
  posts: BlogPostRecord[];
  cursor?: string;
  hasMore: boolean;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface ActionResponse {
  success: boolean;
  message: string;
}

// Admin Action Types
export type AdminAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'publish'
  | 'archive'
  | 'schedule'
  | 'unschedule';

export interface AdminActionLog {
  action: AdminAction;
  slug: string;
  timestamp: string;
  userEmail?: string;
}

