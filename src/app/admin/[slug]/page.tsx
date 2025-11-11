import { Suspense } from 'react';
import { PostEditor } from '../components/PostEditor';
import { notFound } from 'next/navigation';
import { getAdminPost } from '@/server/blog/actions';

export const metadata = {
  title: 'Edit Post',
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getAdminPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<div className="p-6">Loading editor...</div>}>
        <PostEditor post={post} />
      </Suspense>
    </div>
  );
}
