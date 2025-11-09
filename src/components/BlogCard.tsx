'use client';

import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { cn, formatDate } from '@/lib/utils';
import { ArrowRight, BookOpen, Clock, Calendar } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { springAnimations } from '@/lib/animations';
import { AnimatedExpandButton } from '@/components/ui/AnimatedExpandButton';
import type { BlogPostSummary } from '@/types/blog';

interface BlogCardProps {
  post: BlogPostSummary;
}

export function BlogCard({ post }: BlogCardProps) {
  const [isTitleHovered, setIsTitleHovered] = useState(false);

  return (
    <Card className="relative flex h-full flex-col border-white bg-black/5 p-6 text-white backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:bg-black/10">
      <h2 className="mb-3 flex items-center justify-between text-2xl font-bold">
        <Link
          href={`/blog/${post.slug}`}
          className="group relative inline-flex items-center gap-2 rounded transition-all duration-300 hover:bg-white hover:text-black active:bg-white active:text-black"
          style={{
            paddingLeft: isTitleHovered ? '12px' : '0px',
            paddingRight: isTitleHovered ? '12px' : '0px',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
          onMouseEnter={() => setIsTitleHovered(true)}
          onMouseLeave={() => setIsTitleHovered(false)}
        >
          {post.title}
          <motion.div
            animate={{
              x: isTitleHovered ? 0 : -8,
              opacity: isTitleHovered ? 1 : 0,
            }}
            transition={springAnimations.iconText}
          >
            <BookOpen className="h-5 w-5" />
          </motion.div>
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

      <AnimatedExpandButton
        icon={<ArrowRight className="h-5 w-5" />}
        text="read article"
        wrapperClassName="mt-auto"
        href={`/blog/${post.slug}`}
      />
    </Card>
  );
}
