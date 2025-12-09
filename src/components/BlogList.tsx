'use client';

import { useState } from 'react';
import { BlogCard } from '@/components/BlogCard';
import { Button } from '@/components/ui/button';
import type { BlogPostSummary } from '@/types/blog';

interface BlogListProps {
  initialPosts: BlogPostSummary[];
  initialCursor?: string;
  initialHasMore: boolean;
}

export function BlogList({ initialPosts, initialCursor, initialHasMore }: BlogListProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor || loading) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/posts?cursor=${encodeURIComponent(cursor)}&limit=20`);

      if (!response.ok) {
        throw new Error('Failed to load more posts');
      }

      const data = await response.json();

      setPosts((prev) => [...prev, ...data.posts]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {posts.map((post) => (
        <BlogCard key={post.slug} post={post} />
      ))}

      {hasMore && (
        <div className="flex flex-col items-center gap-4 py-8">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button onClick={loadMore} disabled={loading} variant="outline" size="lg" className="min-w-[200px]">
            {loading ? 'Loading...' : 'Load More Posts'}
          </Button>
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className="flex justify-center py-8">
          <p className="text-sm text-muted-foreground">You&apos;ve reached the end of the blog posts</p>
        </div>
      )}
    </div>
  );
}
