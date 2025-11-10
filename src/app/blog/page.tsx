import { BlogList } from '@/components/BlogList';
import { listPublishedPosts } from '@/server/blog/store';
import type { Metadata } from 'next';
import type { BlogPostSummary } from '@/types/blog';

export const metadata: Metadata = {
  title: "Blog - JCV's Portfolio",
  description: 'Thoughts, insights, and technical writings from James Volpe',
};

export default async function BlogPage() {
  let posts: BlogPostSummary[] = [];
  let nextCursor: string | undefined;
  let hasMore = false;

  try {
    const result = await listPublishedPosts(20);
    posts = result.posts;
    nextCursor = result.nextCursor;
    hasMore = result.hasMore;
  } catch (error) {
    console.error('[blog] Failed to load posts', error);
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {posts.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-400">No blog posts yet. Check back soon!</p>
        </div>
      ) : (
        <BlogList initialPosts={posts} initialCursor={nextCursor} initialHasMore={hasMore} />
      )}
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
