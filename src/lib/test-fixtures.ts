import type { RepoData } from '@/lib/github-server';
import type { BlogPostWithContent } from '@/types/blog';

export const TEST_REPO: RepoData = {
  name: 'sample-ai-app',
  description: 'Edge-optimized AI assistant with inline documentation.',
  created_at: '2024-01-01T00:00:00.000Z',
  pushed_at: '2024-02-15T12:00:00.000Z',
  updated_at: '2024-02-15T12:00:00.000Z',
  html_url: 'https://github.com/volpestyle/sample-ai-app',
  owner: { login: 'volpestyle' },
  isStarred: true,
  private: false,
  tags: ['nextjs', 'ai', 'edge'],
  icon: 'rocket',
  languagePercentages: [
    { name: 'TypeScript', percent: 72 },
    { name: 'Rust', percent: 18 },
    { name: 'Python', percent: 10 },
  ],
};

export const TEST_README = `# Sample AI App

This assistant streams responses from edge functions and can surface inline documentation.

## Highlights
- conversational retrieval
- inline docs on demand

## Docs
Read the [API Contract](docs/API.md) for payload details.
`;

export const TEST_DOC_CONTENT = `# API Reference

## POST /api/chat
- Streams responses over SSE.
- Supports attachments for project cards and docs.

## POST /api/send-email
- Accepts name, email, and message payloads.
`;

const nowIso = new Date().toISOString();

export const TEST_BLOG_POSTS: BlogPostWithContent[] = [
  {
    slug: 'shipping-ai-updates',
    title: 'Shipping AI Updates',
    summary: 'Behind the scenes of the latest chat improvements.',
    status: 'published',
    publishedAt: '2024-02-20T10:00:00.000Z',
    updatedAt: '2024-02-20T10:00:00.000Z',
    tags: ['ai', 'nextjs'],
    heroImageKey: 'images/2024/02/ai.jpg',
    readTimeMinutes: 4,
    readTimeLabel: '4 min read',
    currentRevisionKey: 'mock-rev-shipping-ai-updates',
    version: 2,
    content: `## Release notes

- New SSE streaming helpers
- Inline document viewer improvements`,
  },
  {
    slug: 'draft-testing-guide',
    title: 'Draft: Testing Guide',
    summary: 'How I approach E2E coverage for portfolio projects.',
    status: 'draft',
    publishedAt: undefined,
    updatedAt: nowIso,
    tags: ['testing'],
    heroImageKey: undefined,
    readTimeMinutes: 3,
    readTimeLabel: '3 min read',
    currentRevisionKey: 'mock-rev-draft-testing-guide',
    version: 1,
    content: `## Outline

1. Deterministic fixtures
2. Chat streaming stubs
3. Admin flows`,
  },
];
