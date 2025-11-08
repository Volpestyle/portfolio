import { getBlogPost, getAllBlogPosts } from '@/lib/blog';
import { BlogMarkdown } from '@/components/BlogMarkdown';
import { formatDate } from '@/lib/utils';
import { Calendar, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ articleId: string }> }): Promise<Metadata> {
  const { articleId } = await params;
  const post = getBlogPost(articleId);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: `${post.title} - JCV's Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export async function generateStaticParams() {
  const posts = getAllBlogPosts();

  return posts.map((post) => ({
    articleId: post.id,
  }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ articleId: string }> }) {
  const { articleId } = await params;
  const post = getBlogPost(articleId);

  if (!post) {
    notFound();
  }

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

          {post.description && <p className="mb-6 text-xl text-gray-400">{post.description}</p>}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={post.date}>{formatDate(post.date)}</time>
            </div>
            {post.readTime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readTime}</span>
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
          <BlogMarkdown content={post.content} />
        </div>
      </article>

      {/* Back to blog link at bottom */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to blog</span>
      </Link>
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour

