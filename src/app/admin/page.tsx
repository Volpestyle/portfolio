import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PostsTable } from './components/PostsTable';
import { PostsFilters } from './components/PostsFilters';

export const metadata = {
  title: 'Admin - Blog Posts',
  description: 'Manage blog posts',
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Blog Posts</h1>
            <p className="text-muted-foreground mt-1">Manage and publish your blog content</p>
          </div>
          <Link href="/admin/new">
            <Button size="lg" className="gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              New Post
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle>All Posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Suspense fallback={<div className="text-muted-foreground">Loading filters...</div>}>
              <PostsFilters />
            </Suspense>
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Loading posts...</div>
                </div>
              }
            >
              <PostsTable />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

