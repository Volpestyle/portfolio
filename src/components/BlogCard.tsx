import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { ArrowRight, BookOpen, Clock, Calendar } from 'lucide-react';
import type { BlogPostSummary } from '@/types/blog';

interface BlogCardProps {
  post: BlogPostSummary;
}

export function BlogCard({ post }: BlogCardProps) {
  return (
    <Card className="group relative flex h-full flex-col border-white bg-black/5 p-6 text-white backdrop-blur-sm transition-colors duration-300 hover:border-white/60 hover:bg-black/10">
      <h2 className="mb-3 flex items-center justify-between text-2xl font-bold">
        <Link
          href={`/blog/${post.slug}`}
          className="inline-flex items-center gap-2 rounded px-3 py-2 transition-all duration-300 hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span>{post.title}</span>
          <BookOpen className="h-5 w-5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </Link>
      </h2>

      {post.summary && <p className="mb-4 text-sm leading-relaxed opacity-90">{post.summary}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDate(post.publishedAt ?? post.updatedAt)}</span>
        </div>
        {post.readTimeLabel && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{post.readTimeLabel}</span>
          </div>
        )}
      </div>

      {post.tags && post.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
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

      <div className="mt-auto pt-2">
        <Link
          href={`/blog/${post.slug}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors duration-300 hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        >
          Read article
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
    </Card>
  );
}
