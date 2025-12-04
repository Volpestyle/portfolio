import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">Post not found</p>
        <p className="text-sm text-muted-foreground">
          The post you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link href="/admin">
          <Button>Back to Posts</Button>
        </Link>
      </div>
    </div>
  );
}
