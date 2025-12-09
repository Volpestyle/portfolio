import { NextResponse } from 'next/server';
import { getPostWithContent } from '@/server/blog/store';
import { BLOG_FIXTURE_RUNTIME_FLAG, shouldServeFixturesForRequest } from '@/lib/test-flags';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export const runtime = 'nodejs';

export async function GET(req: Request, context: RouteContext) {
  // Fixture support for E2E/local parity
  if (shouldServeFixturesForRequest(req.headers, { fixtureFlag: BLOG_FIXTURE_RUNTIME_FLAG })) {
    const { TEST_BLOG_POSTS } = await import('@portfolio/test-support/fixtures');
    const slugParam = (await context.params).slug;
    const post = TEST_BLOG_POSTS.find((p) => p.slug === slugParam && p.status === 'published');
    if (!post) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }
    return NextResponse.json(post);
  }

  try {
    const { slug } = await context.params;
    const post = await getPostWithContent(slug, { includeDraft: false });
    if (!post) {
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }
    return NextResponse.json(post);
  } catch (error) {
    console.error('[api/posts/[slug]] Failed to fetch post', error);
    return NextResponse.json({ message: 'Failed to fetch post' }, { status: 500 });
  }
}
