import { Markdown } from '@/components/Markdown';
import { formatDate } from '@/lib/utils';
import { getPostWithContent, listPublishedPosts } from '@/server/blog/store';
import { draftMode } from 'next/headers';
import { Calendar, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

type PageContext = {
  params: { slug: string };
};

export async function generateMetadata({ params }: PageContext): Promise<Metadata> {
  const { slug } = params;
  const post = await getPostWithContent(slug).catch(() => null);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: `${post.title} - JCV's Blog`,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: 'article',
      publishedTime: post.publishedAt,
    },
  };
}

export async function generateStaticParams() {
  try {
    const { posts } = await listPublishedPosts();
    return posts.map((post) => ({
      slug: post.slug,
    }));
  } catch (error) {
    console.error('[blog] Failed to pre-generate params', error);
    return [];
  }
}

export default async function BlogPostPage({ params }: PageContext) {
  const { slug } = params;
  const { isEnabled } = await draftMode();
  const postRecord = await getPostWithContent(slug, { includeDraft: isEnabled });

  if (!postRecord) {
    notFound();
  }

  const post = postRecord;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Back button */}
      <Link
        href="/blog"
        className="mb-8 inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to blog</span>
      </Link>

      {/* Article header */}
      <article className="mb-8">
        <header className="mb-8 border-b border-white/20 pb-8">
          <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">{post.title}</h1>

          {post.summary && <p className="mb-6 text-xl text-gray-400">{post.summary}</p>}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={post.publishedAt ?? post.updatedAt}>
                {formatDate(post.publishedAt ?? post.updatedAt)}
              </time>
            </div>
            {post.readTimeLabel && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readTimeLabel}</span>
              </div>
            )}
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-white/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Article content */}
        <div className="rounded-lg border border-white/20 bg-black/20 p-8 backdrop-blur-sm md:p-12">
          <Markdown content={post.content} />
        </div>
      </article>

      {/* Back to blog link at bottom */}
      <Link href="/blog" className="inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        <span>Back to blog</span>
      </Link>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour
