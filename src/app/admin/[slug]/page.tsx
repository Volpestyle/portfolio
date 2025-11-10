import { Suspense } from 'react';
import { PostEditor } from '../components/PostEditor';
import { notFound } from 'next/navigation';
import { getAdminPost } from '@/server/blog/actions';

export const metadata = {
  title: 'Edit Post',
};

export default async function EditPostPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
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
