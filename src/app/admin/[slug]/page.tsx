import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PostEditor } from '../components/PostEditor';
import { AdminPageSkeleton } from '../components/AdminPageSkeleton';
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
    <Suspense fallback={<AdminPageSkeleton rows={2} withFilters={false} showAction={false} />}>
      <PostEditor post={post} />
    </Suspense>
  );
}
