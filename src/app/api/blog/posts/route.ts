import { NextResponse } from 'next/server';
import { listPublishedPosts, InvalidBlogCursorError } from '@/server/blog/store';
import { BLOG_FIXTURE_RUNTIME_FLAG, shouldServeFixturesForRequest } from '@/lib/test-flags';

export async function GET(req: Request) {
  // Return deterministic fixtures for E2E tests
  if (shouldServeFixturesForRequest(req.headers, { fixtureFlag: BLOG_FIXTURE_RUNTIME_FLAG })) {
    const { TEST_BLOG_POSTS } = await import('@portfolio/test-support/fixtures');
    const published = TEST_BLOG_POSTS.filter((post) => post.status === 'published');
    return NextResponse.json({
      posts: published,
      hasMore: false,
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam === null ? 20 : Number(limitParam);

    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ message: 'Limit must be between 1 and 50' }, { status: 400 });
    }

    const result = await listPublishedPosts(limit, cursor);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidBlogCursorError) {
      return NextResponse.json({ message: 'Invalid cursor' }, { status: 400 });
    }
    console.error('[api/blog/posts] Error fetching posts:', error);
    return NextResponse.json(
      { message: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
