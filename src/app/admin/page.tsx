import { Suspense } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransitionLink } from '@/components/PageTransition';
import { PostsTable } from './components/PostsTable';
import { PostsFilters } from './components/PostsFilters';

export const metadata = {
  title: 'Admin - Blog Posts',
  description: 'Manage blog posts',
};

export default function AdminPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Blog Posts</h1>
          <p className="mt-1 text-sm text-white/60">Manage and publish your blog content</p>
        </div>
        <TransitionLink href="/admin/new">
          <Button size="lg" variant="onBlack" className="gap-2">
            <Plus className="h-5 w-5" />
            New Post
          </Button>
        </TransitionLink>
      </div>

      {/* Main Content */}
      <Card className="border-white/20 bg-black/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">All Posts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense fallback={<div className="text-white/60">Loading filters...</div>}>
            <PostsFilters />
          </Suspense>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="text-white/60">Loading posts...</div>
              </div>
            }
          >
            <PostsTable />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
