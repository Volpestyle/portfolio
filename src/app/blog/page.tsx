import { BlogCard } from '@/components/BlogCard';
import { getAllBlogPosts } from '@/lib/blog';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Blog - JCV's Portfolio",
  description: 'Thoughts, insights, and technical writings from James Volpe',
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-3 text-4xl font-bold text-white">Blog</h1>
        <p className="text-lg text-gray-400">Thoughts, insights, and technical writings</p>
      </div>

      {posts.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-gray-400">No blog posts yet. Check back soon!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {posts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

export const revalidate = 3600; // Revalidate every hour

